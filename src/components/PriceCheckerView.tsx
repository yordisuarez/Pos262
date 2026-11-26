import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  Package,
  ScanBarcode,
  Search,
  Tag,
  X,
} from 'lucide-react';
import type { Branch, Product } from '../types/pos';
import { ProductImageBox } from './ProductImageBox';

interface PriceCheckerViewProps {
  products: Product[];
  activeBranch: Branch | undefined;
  exchangeRate: number;
  onExit: () => void;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatVes = (amount: number): string =>
  `Bs ${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const PriceCheckerView: React.FC<PriceCheckerViewProps> = ({
  products,
  activeBranch,
  exchangeRate,
  onExit,
}) => {
  const [scanInput, setScanInput] = useState<string>('');
  const [matchedProductId, setMatchedProductId] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  // Optional camera barcode scanner state (native BarcodeDetector API when supported)
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const lastCameraScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const supportsCameraScanner = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return Boolean(
      'BarcodeDetector' in window &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }, []);

  const focusScannerInput = useCallback(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Keep latest live product reference from catalog in case price/stock updates via sync
  const matchedProduct = useMemo(() => {
    if (!matchedProductId) return null;
    return products.find((p) => p.id === matchedProductId) ?? null;
  }, [products, matchedProductId]);

  const lookupCode = useCallback(
    (rawCode: string) => {
      const cleaned = rawCode.trim();
      if (!cleaned) {
        focusScannerInput();
        return;
      }

      const lower = cleaned.toLowerCase();

      // Priority: exact barcode -> exact SKU -> exact name -> partial barcode/SKU/name
      const found =
        products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === lower) ??
        products.find((p) => p.sku.trim().toLowerCase() === lower) ??
        products.find((p) => p.name.trim().toLowerCase() === lower) ??
        products.find(
          (p) =>
            (p.barcode && p.barcode.toLowerCase().includes(lower)) ||
            p.sku.toLowerCase().includes(lower) ||
            p.name.toLowerCase().includes(lower)
        ) ??
        null;

      setLastScannedCode(cleaned);
      setScanInput('');

      if (found) {
        setMatchedProductId(found.id);
        setNotFoundCode(null);
      } else {
        setMatchedProductId(null);
        setNotFoundCode(cleaned);
      }

      window.requestAnimationFrame(() => {
        focusScannerInput();
      });
    },
    [products, focusScannerInput]
  );

  // Auto-focus scanner input on mount, window refocus, and non-interactive keystrokes
  useEffect(() => {
    focusScannerInput();

    const handleWindowFocus = () => {
      focusScannerInput();
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key.length === 1 || event.key === 'Enter') {
        focusScannerInput();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      stopCamera();
    };
  }, [focusScannerInput, stopCamera]);

  // Camera barcode scanning loop when activated
  useEffect(() => {
    if (!cameraActive || !supportsCameraScanner) return;

    let cancelled = false;
    setCameraError('');

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const videoEl = videoRef.current;
        if (!videoEl) return;

        videoEl.srcObject = stream;
        await videoEl.play();

        const DetectorCtor = (
          window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }
        ).BarcodeDetector;
        if (!DetectorCtor) {
          setCameraError('Este navegador no soporta detección de códigos por cámara.');
          stopCamera();
          return;
        }

        const detector = new DetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
        });

        scanTimerRef.current = window.setInterval(async () => {
          const el = videoRef.current;
          if (!el || el.readyState < 2) return;
          try {
            const barcodes = await detector.detect(el);
            const rawValue = barcodes[0]?.rawValue?.trim();
            if (!rawValue) return;
            const now = Date.now();
            if (
              lastCameraScanRef.current.code === rawValue &&
              now - lastCameraScanRef.current.at < 1500
            ) {
              return;
            }
            lastCameraScanRef.current = { code: rawValue, at: now };
            lookupCode(rawValue);
          } catch {
            // Ignore transient frame detection errors
          }
        }, 250);
      } catch {
        if (!cancelled) {
          setCameraError(
            'No se pudo acceder a la cámara. Verifica los permisos o usa el lector/teclado.'
          );
          stopCamera();
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (scanTimerRef.current !== null) {
        window.clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [cameraActive, supportsCameraScanner, lookupCode, stopCamera]);

  const handleInputChange = (value: string) => {
    setScanInput(value);

    // Instant auto-lookup if a scanner inputs an exact barcode (length >= 6) without sending Enter
    const trimmed = value.trim();
    if (trimmed.length >= 6) {
      const lower = trimmed.toLowerCase();
      const exactBarcodeMatch = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === lower
      );
      if (exactBarcodeMatch) {
        lookupCode(trimmed);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupCode(scanInput);
  };

  const handleClearResult = () => {
    setMatchedProductId(null);
    setNotFoundCode(null);
    setLastScannedCode('');
    setScanInput('');
    focusScannerInput();
  };

  const branchStock = matchedProduct
    ? activeBranch
      ? matchedProduct.stockByBranch[activeBranch.id] ?? 0
      : Object.values(matchedProduct.stockByBranch).reduce((acc, qty) => acc + qty, 0)
    : 0;

  const totalCatalogStock = matchedProduct
    ? Object.values(matchedProduct.stockByBranch).reduce((acc, qty) => acc + qty, 0)
    : 0;

  const matchedPriceVes = matchedProduct ? round2(matchedProduct.priceUsd * exchangeRate) : 0;

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 lg:p-6"
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('button, a, input, video')) {
          focusScannerInput();
        }
      }}
    >
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] text-[#558B00]">
              <ScanBarcode className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900">
                Verificador de precios
              </h1>
              <p className="truncate text-xs text-slate-500">
                Consulta rápida por código de barras o SKU
                {activeBranch ? ` · ${activeBranch.name}` : ''} · Tasa{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-700">
                  Bs {exchangeRate.toFixed(2)}/$
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onExit();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al POS
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[210px]">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#558B00]" />
            <input
              ref={inputRef}
              type="text"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={scanInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Escanea código de barras o escribe SKU / nombre y pulsa Enter..."
              aria-label="Código de barras o SKU del producto"
              className="w-full rounded-lg border-2 border-[#84CC16]/70 bg-slate-50 py-2.5 pl-9 pr-9 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
            {scanInput && (
              <button
                type="button"
                onClick={() => {
                  setScanInput('');
                  focusScannerInput();
                }}
                aria-label="Limpiar código"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" />
            Consultar
          </button>

          {supportsCameraScanner && (
            <button
              type="button"
              onClick={() => {
                setCameraError('');
                if (cameraActive) {
                  stopCamera();
                  focusScannerInput();
                } else {
                  setCameraActive(true);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                cameraActive
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#76B900] hover:text-slate-900'
              }`}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="h-3.5 w-3.5" />
                  Cerrar cámara
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5 text-[#558B00]" />
                  Cámara
                </>
              )}
            </button>
          )}
        </form>

        {cameraError && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{cameraError}</span>
          </div>
        )}

        {cameraActive && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
            <div className="relative mx-auto aspect-video max-h-56 w-full">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-[#84CC16] shadow-[0_0_8px_#84CC16]" />
            </div>
            <p className="bg-slate-900 px-3 py-1.5 text-center text-[11px] font-medium text-slate-200">
              Apunta la cámara al código de barras del producto
            </p>
          </div>
        )}
      </section>

      {matchedProduct ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="grid grid-cols-1 gap-0 md:grid-cols-12">
            <div className="border-b border-slate-200 bg-slate-50/70 p-4 md:col-span-5 md:border-b-0 md:border-r">
              <ProductImageBox
                src={matchedProduct.imageUrl || matchedProduct.image_url}
                name={matchedProduct.name}
                alt={matchedProduct.name}
                fit="contain"
                className="h-56 w-full rounded-lg border-slate-200 bg-white sm:h-64 md:h-full md:min-h-[280px]"
              />
            </div>

            <div className="flex flex-col justify-between gap-4 p-4 sm:p-6 md:col-span-7">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      <Tag className="h-3 w-3 text-[#558B00]" />
                      {matchedProduct.category || 'General'}
                    </span>
                    <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-tight tracking-tight text-slate-900">
                      {matchedProduct.name}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearResult}
                    aria-label="Limpiar consulta actual"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="rounded-xl border border-[#84CC16]/50 bg-[#F7FEE7]/70 p-4 tabular-nums">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#3F6212]">
                    Precio de venta
                  </p>
                  <p className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">
                    {formatVes(matchedPriceVes)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-[#84CC16]/30 pt-2">
                    <p className="font-mono text-lg sm:text-xl font-bold text-[#3F6212]">
                      {formatUsd(matchedProduct.priceUsd)}{' '}
                      <span className="font-sans text-xs font-semibold text-[#558B00]">USD</span>
                    </p>
                    <span className="text-[11px] font-medium text-slate-600">
                      por {matchedProduct.unit || 'und'} · Tasa Bs {exchangeRate.toFixed(2)}/$
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-500">Código de barras</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {matchedProduct.barcode || 'Sin código'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-500">SKU</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-semibold text-slate-900">
                      {matchedProduct.sku || 'Sin SKU'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-500">Unidad</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-900">
                      {matchedProduct.unit || 'und'}
                    </p>
                  </div>

                  <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 sm:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">
                          Disponibilidad{activeBranch ? ` (${activeBranch.name})` : ''}
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                          {branchStock} {matchedProduct.unit || 'und'}
                          {activeBranch && totalCatalogStock !== branchStock && (
                            <span className="ml-2 text-xs font-medium text-slate-500">
                              (Total sucursales: {totalCatalogStock})
                            </span>
                          )}
                        </p>
                      </div>

                      {branchStock <= 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Agotado
                        </span>
                      ) : branchStock <= matchedProduct.minStock ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          <Package className="h-3.5 w-3.5" />
                          Stock bajo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#84CC16]/45 bg-[#F7FEE7] px-2.5 py-1 text-xs font-semibold text-[#3F6212]">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#558B00]" />
                          Disponible
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Escanea otro código en cualquier momento para reemplazar automáticamente esta consulta.
              </p>
            </div>
          </div>
        </section>
      ) : notFoundCode ? (
        <section className="rounded-xl border border-red-200 bg-white p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base sm:text-lg font-bold text-slate-900">
            Producto no encontrado
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            No se encontró ningún artículo registrado para el código{' '}
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono font-semibold text-slate-900">
              {notFoundCode}
            </span>
            .
          </p>
          <p className="mt-2 text-xs text-slate-500">
            El lector sigue listo: escanea otro código de barras o ingresa otro SKU.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#84CC16]/45 bg-[#F7FEE7] text-[#558B00]">
            <ScanBarcode className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">Listo para escanear</h2>
          <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-slate-600">
            Escanea un código de barras con tu lector USB/Bluetooth o escribe el código para
            consultar el precio en Bs y USD junto con los detalles del producto.
          </p>
          {lastScannedCode && (
            <p className="mt-2 text-[11px] text-slate-400">Última consulta: {lastScannedCode}</p>
          )}
        </section>
      )}
    </div>
  );
};
