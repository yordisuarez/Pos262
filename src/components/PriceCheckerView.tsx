import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Camera, CameraOff, ScanBarcode } from 'lucide-react';
import type { Branch, Product } from '../types/pos';
import { getSafeProductImageUrl } from '../services/productImage';

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
  const [notFound, setNotFound] = useState<boolean>(false);
  const [scanSeq, setScanSeq] = useState<number>(0);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  // Optional camera barcode scanner state (native BarcodeDetector API when supported)
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const exitButtonRef = useRef<HTMLButtonElement | null>(null);
  const cameraButtonRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const autoLookupTimerRef = useRef<number | null>(null);
  const bufferRef = useRef<string>('');
  const lastCharAtRef = useRef<number>(0);
  const rapidBurstRef = useRef<boolean>(false);
  const isExitingRef = useRef<boolean>(false);
  const lastCameraScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const supportsCameraScanner = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return Boolean(
      'BarcodeDetector' in window &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }, []);

  const clearAutoLookupTimer = useCallback(() => {
    if (autoLookupTimerRef.current !== null) {
      window.clearTimeout(autoLookupTimerRef.current);
      autoLookupTimerRef.current = null;
    }
  }, []);

  const focusScannerInput = useCallback(() => {
    if (isExitingRef.current) return;
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

  // Keep latest live product reference from catalog in case price updates via sync
  const matchedProduct = useMemo(() => {
    if (!matchedProductId) return null;
    return products.find((p) => p.id === matchedProductId) ?? null;
  }, [products, matchedProductId]);

  const lookupCode = useCallback(
    (rawCode: string) => {
      clearAutoLookupTimer();

      const cleaned = rawCode.replace(/[\r\n]+/g, '').trim();
      bufferRef.current = '';
      rapidBurstRef.current = false;
      setScanInput('');

      if (!cleaned) {
        focusScannerInput();
        return;
      }

      const lower = cleaned.toLowerCase();

      // Priority: exact barcode -> exact SKU -> exact name -> partial barcode/SKU/name
      const found =
        products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === lower) ??
        products.find((p) => p.sku && p.sku.trim().toLowerCase() === lower) ??
        products.find((p) => p.name.trim().toLowerCase() === lower) ??
        products.find(
          (p) =>
            (p.barcode && p.barcode.toLowerCase().includes(lower)) ||
            (p.sku && p.sku.toLowerCase().includes(lower)) ||
            p.name.toLowerCase().includes(lower)
        ) ??
        null;

      setScanSeq((prev) => prev + 1);

      if (found) {
        setMatchedProductId(found.id);
        setNotFound(false);
        setFailedImageSrc(null);
      } else {
        setMatchedProductId(null);
        setNotFound(true);
      }

      window.requestAnimationFrame(() => {
        focusScannerInput();
      });
    },
    [products, clearAutoLookupTimer, focusScannerInput]
  );

  const handleScannerBufferChange = useCallback(
    (rawValue: string) => {
      clearAutoLookupTimer();

      // Immediate lookup if scanner appended a newline or carriage return
      if (/[\r\n]/.test(rawValue)) {
        lookupCode(rawValue);
        return;
      }

      const now = Date.now();
      const prevLen = bufferRef.current.length;
      const deltaMs = now - lastCharAtRef.current;

      if (rawValue.length === 0) {
        bufferRef.current = '';
        rapidBurstRef.current = false;
        setScanInput('');
        return;
      }

      if ((prevLen > 0 && deltaMs <= 90) || rawValue.length - prevLen >= 3) {
        rapidBurstRef.current = true;
      } else if (prevLen === 0) {
        rapidBurstRef.current = false;
      }

      lastCharAtRef.current = now;
      bufferRef.current = rawValue;
      setScanInput(rawValue);

      const trimmed = rawValue.trim();
      if (!trimmed) return;

      const lower = trimmed.toLowerCase();

      // 1. Instant lookup on unambiguous exact barcode match (zero Enter required)
      const exactBarcodeMatch = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === lower
      );
      if (exactBarcodeMatch) {
        const hasLongerBarcodePrefix = products.some((p) => {
          const code = p.barcode?.trim().toLowerCase();
          return Boolean(code && code !== lower && code.startsWith(lower));
        });

        if (!hasLongerBarcodePrefix) {
          lookupCode(trimmed);
          return;
        }

        autoLookupTimerRef.current = window.setTimeout(() => {
          lookupCode(bufferRef.current);
        }, 180);
        return;
      }

      // 2. Fast auto-lookup on exact SKU match (length >= 4)
      if (trimmed.length >= 4) {
        const exactSkuMatch = products.find(
          (p) => p.sku && p.sku.trim().toLowerCase() === lower
        );
        if (exactSkuMatch) {
          const hasLongerSkuPrefix = products.some((p) => {
            const sku = p.sku?.trim().toLowerCase();
            return Boolean(sku && sku !== lower && sku.startsWith(lower));
          });

          if (!hasLongerSkuPrefix && rapidBurstRef.current) {
            lookupCode(trimmed);
            return;
          }

          autoLookupTimerRef.current = window.setTimeout(() => {
            lookupCode(bufferRef.current);
          }, hasLongerSkuPrefix ? 240 : 160);
          return;
        }
      }

      // 3. Rapid scanner burst without Enter (including unregistered barcodes) -> commit right after burst ends
      if (rapidBurstRef.current && trimmed.length >= 3) {
        autoLookupTimerRef.current = window.setTimeout(() => {
          lookupCode(bufferRef.current);
        }, 220);
        return;
      }

      // 4. Manual typing without pressing Enter -> auto-commit cleanly after brief pause
      if (trimmed.length >= 4) {
        autoLookupTimerRef.current = window.setTimeout(() => {
          lookupCode(bufferRef.current);
        }, 700);
      }
    },
    [products, clearAutoLookupTimer, lookupCode]
  );

  // Keep scanner 100% active: mount focus, window/tab refocus, and zero-drop global key capture
  useEffect(() => {
    focusScannerInput();

    const handleWindowFocus = () => {
      focusScannerInput();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        focusScannerInput();
      }
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const inputEl = inputRef.current;
      if (document.activeElement === inputEl) return;

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (bufferRef.current.trim().length > 0) {
          event.preventDefault();
          lookupCode(bufferRef.current);
        } else {
          focusScannerInput();
        }
        return;
      }

      if (event.key === 'Backspace') {
        if (bufferRef.current.length > 0) {
          event.preventDefault();
          focusScannerInput();
          handleScannerBufferChange(bufferRef.current.slice(0, -1));
        }
        return;
      }

      if (event.key.length === 1) {
        // Capture first character even if focus drifted so scanners never drop digit 1
        event.preventDefault();
        focusScannerInput();
        handleScannerBufferChange(bufferRef.current + event.key);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      clearAutoLookupTimer();
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      stopCamera();
    };
  }, [focusScannerInput, lookupCode, handleScannerBufferChange, clearAutoLookupTimer, stopCamera]);

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
          setCameraError('No se pudo acceder a la cámara. Verifica los permisos o usa el lector.');
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      lookupCode(bufferRef.current);
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const nextFocus = e.relatedTarget as Node | null;
    if (
      nextFocus &&
      (nextFocus === exitButtonRef.current || nextFocus === cameraButtonRef.current)
    ) {
      return;
    }
    window.setTimeout(() => {
      focusScannerInput();
    }, 60);
  };

  const handleExit = () => {
    isExitingRef.current = true;
    clearAutoLookupTimer();
    stopCamera();
    onExit();
  };

  const matchedPriceVes = matchedProduct ? round2(matchedProduct.priceUsd * exchangeRate) : 0;
  const safeImageUrl = matchedProduct
    ? getSafeProductImageUrl(matchedProduct.imageUrl || matchedProduct.image_url) || ''
    : '';
  const hasVisibleImage = Boolean(safeImageUrl && failedImageSrc !== safeImageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900"
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('button, a, video')) {
          focusScannerInput();
        }
      }}
    >
      {/* Discreet Full-Screen Header */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] text-[#558B00]">
            <ScanBarcode className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1 className="whitespace-nowrap text-sm font-bold tracking-tight text-slate-900 sm:text-base">
              Verificador de precios
            </h1>
            <p className="truncate text-xs text-slate-500">
              {activeBranch ? `${activeBranch.name} · ` : ''}
              Tasa{' '}
              <span className="font-mono font-semibold tabular-nums text-slate-700">
                Bs {exchangeRate.toFixed(2)}/$
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {supportsCameraScanner && (
            <button
              ref={cameraButtonRef}
              type="button"
              onClick={() => {
                setCameraError('');
                if (cameraActive) {
                  stopCamera();
                } else {
                  setCameraActive(true);
                }
                window.setTimeout(() => focusScannerInput(), 0);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                cameraActive
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100/70'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-[#76B900] hover:bg-slate-50 hover:text-slate-900'
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

          <button
            ref={exitButtonRef}
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-[#76B900] hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al POS
          </button>
        </div>
      </header>

      {/* Optional Camera Scanner Strip */}
      {(cameraActive || cameraError) && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-xl space-y-2">
            {cameraError && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{cameraError}</span>
              </div>
            )}

            {cameraActive && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                <div className="relative aspect-video max-h-48 w-full">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-[#84CC16] shadow-[0_0_8px_#84CC16]" />
                </div>
                <p className="bg-slate-900 px-3 py-1.5 text-center text-xs text-slate-200">
                  Apunta la cámara al código de barras
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Full-Screen Showcase Stage */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6 sm:px-8 sm:py-10 lg:px-12">
        {matchedProduct ? (
          <section
            key={`${matchedProduct.id}-${scanSeq}`}
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {hasVisibleImage ? (
              <div className="grid grid-cols-1 items-stretch md:grid-cols-12">
                <div className="flex items-center justify-center border-b border-slate-200 bg-white p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r lg:p-10">
                  <img
                    src={safeImageUrl}
                    alt={matchedProduct.name}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImageSrc(safeImageUrl)}
                    className="max-h-64 w-full object-contain sm:max-h-80 lg:max-h-[400px]"
                  />
                </div>

                <div className="flex flex-col justify-center gap-6 p-6 sm:p-10 md:col-span-7 lg:p-12">
                  <div className="space-y-2">
                    {matchedProduct.category && (
                      <p className="text-sm font-medium text-slate-500">
                        {matchedProduct.category}
                      </p>
                    )}
                    <h2 className="text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                      {matchedProduct.name}
                    </h2>
                  </div>

                  <div className="border-t border-slate-200 pt-6 tabular-nums">
                    <p className="text-5xl font-black leading-none tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
                      {formatVes(matchedPriceVes)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="font-mono text-2xl font-extrabold text-[#3F6212] sm:text-3xl lg:text-4xl">
                        {formatUsd(matchedProduct.priceUsd)}
                        <span className="ml-1.5 font-sans text-base font-bold text-[#558B00] sm:text-lg">
                          USD
                        </span>
                      </p>
                      {matchedProduct.unit && (
                        <span className="text-sm font-medium text-slate-500">
                          · por {matchedProduct.unit}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center sm:px-12 sm:py-16 lg:px-16 lg:py-20">
                <div className="space-y-2.5">
                  {matchedProduct.category && (
                    <p className="text-sm font-medium text-slate-500">
                      {matchedProduct.category}
                    </p>
                  )}
                  <h2 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                    {matchedProduct.name}
                  </h2>
                </div>

                <div className="w-24 border-t border-slate-200" />

                <div className="tabular-nums">
                  <p className="text-6xl font-black leading-none tracking-tight text-slate-950 sm:text-7xl lg:text-8xl">
                    {formatVes(matchedPriceVes)}
                  </p>
                  <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
                    <p className="font-mono text-3xl font-extrabold text-[#3F6212] sm:text-4xl">
                      {formatUsd(matchedProduct.priceUsd)}
                      <span className="ml-1.5 font-sans text-lg font-bold text-[#558B00] sm:text-xl">
                        USD
                      </span>
                    </p>
                    {matchedProduct.unit && (
                      <span className="text-base font-medium text-slate-500">
                        · por {matchedProduct.unit}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : notFound ? (
          <section
            key={`not-found-${scanSeq}`}
            className="w-full max-w-xl rounded-2xl border border-red-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10 sm:py-14"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Producto no encontrado
            </h2>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Escanea otro producto para consultar su precio al instante.
            </p>
          </section>
        ) : (
          <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#84CC16]/45 bg-[#F7FEE7] text-[#558B00]">
              <ScanBarcode className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Escanea un producto
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-sm text-slate-600 sm:text-base">
              Acerca el código de barras al lector para mostrar el precio de inmediato.
            </p>
          </section>
        )}
      </main>

      {/* Discreet Always-Active Scanner Bar (No Submit Button, No Enter Required) */}
      <footer className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="relative mx-auto w-full max-w-md">
          <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#558B00]" />
          <input
            ref={inputRef}
            type="text"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={scanInput}
            onChange={(e) => handleScannerBufferChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            placeholder="Lector siempre activo — escanea un código..."
            aria-label="Lector de código de barras del verificador de precios"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
          />
        </div>
      </footer>
    </div>
  );
};
