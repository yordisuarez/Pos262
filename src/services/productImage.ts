import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const PRODUCT_IMAGES_BUCKET = 'product-images';
const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB pre-compression safety cap
const DEFAULT_MAX_DIMENSION = 600;
const DEFAULT_WEBP_QUALITY = 0.78;
const DEFAULT_JPEG_QUALITY = 0.8;
const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CompressedProductImage {
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  extension: 'webp' | 'jpg';
  width: number;
  height: number;
  sizeBytes: number;
}

export function getSafeProductImageUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (SAFE_DATA_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function formatImageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function decodeImageSource(
  file: File
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement for formats/browsers where createImageBitmap fails
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Resizes and compresses a selected product photo client-side (max 600x600px)
 * into lightweight WebP (with JPEG fallback) before uploading to Supabase Storage.
 */
export async function compressProductImage(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<CompressedProductImage> {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WebP).');
  }
  if (file.type.toLowerCase() === 'image/svg+xml') {
    throw new Error('Las imágenes SVG no están permitidas. Usa JPG, PNG o WebP.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('La imagen supera el límite de 15 MB. Selecciona una foto más liviana.');
  }

  const maxDim = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const webpQuality = options?.quality ?? DEFAULT_WEBP_QUALITY;

  const source = await decodeImageSource(file);
  try {
    if (source.width <= 0 || source.height <= 0) {
      throw new Error('No se pudieron obtener las dimensiones de la imagen.');
    }

    const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
    const targetWidth = Math.max(1, Math.round(source.width * scale));
    const targetHeight = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Tu navegador no soporta la compresión de imágenes.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    source.draw(ctx, targetWidth, targetHeight);

    const webpBlob = await canvasToBlob(canvas, 'image/webp', webpQuality);
    if (webpBlob && webpBlob.type === 'image/webp' && webpBlob.size > 0) {
      return {
        blob: webpBlob,
        mimeType: 'image/webp',
        extension: 'webp',
        width: targetWidth,
        height: targetHeight,
        sizeBytes: webpBlob.size,
      };
    }

    // Fallback to JPEG with clean white background (avoids black transparent areas)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    source.draw(ctx, targetWidth, targetHeight);

    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', DEFAULT_JPEG_QUALITY);
    if (!jpegBlob || jpegBlob.size <= 0) {
      throw new Error('No se pudo comprimir la imagen seleccionada.');
    }

    return {
      blob: jpegBlob,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: targetWidth,
      height: targetHeight,
      sizeBytes: jpegBlob.size,
    };
  } finally {
    source.cleanup();
  }
}

function sanitizePathSegment(raw?: string): string {
  const cleaned = (raw || 'producto')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'producto';
}

/**
 * Uploads a pre-compressed product image blob to the `product-images` Supabase Storage bucket
 * and returns only the public URL to store on the product record.
 */
export async function uploadProductImage(
  compressed: CompressedProductImage,
  options: { userId?: string | null; skuOrId?: string }
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY o guarda el producto sin foto.'
    );
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      'Sin conexión a internet para subir la foto. Conéctate o quita la foto para guardar en modo offline.'
    );
  }

  let resolvedUserId = options.userId ?? null;
  if (!resolvedUserId) {
    const { data } = await supabase.auth.getSession();
    resolvedUserId = data.session?.user?.id ?? null;
  }

  if (!resolvedUserId || !UUID_REGEX.test(resolvedUserId)) {
    throw new Error(
      'Inicia sesión en la nube para subir fotos de productos, o guarda el producto sin foto.'
    );
  }

  const safeSlug = sanitizePathSegment(options.skuOrId);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const storagePath = `${resolvedUserId}/${safeSlug}-${uniqueSuffix}.${compressed.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, compressed.blob, {
      contentType: compressed.mimeType,
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `No se pudo subir la foto al bucket "${PRODUCT_IMAGES_BUCKET}": ${uploadError.message}`
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  const safeUrl = getSafeProductImageUrl(publicUrlData?.publicUrl);
  if (!safeUrl) {
    throw new Error('La URL devuelta por Supabase Storage no es válida.');
  }

  return safeUrl;
}
