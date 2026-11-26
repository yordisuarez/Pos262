import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Plus, Scale, X } from 'lucide-react';
import type { Product } from '../types/pos';
import {
  formatQuantity,
  parseDecimalQuantity,
  roundQty,
} from '../utils/quantityUnits';

interface WeightQuantityModalProps {
  product: Product;
  exchangeRate: number;
  maxAvailable: number;
  currentInCart?: number;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

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

export const WeightQuantityModal: React.FC<WeightQuantityModalProps> = ({
  product,
  exchangeRate,
  maxAvailable,
  currentInCart = 0,
  onConfirm,
  onClose,
}) => {
  const unitLabel = product.unit?.trim() || 'kg';
  const remainingStock = useMemo(
    () => Math.max(0, roundQty(maxAvailable - currentInCart)),
    [maxAvailable, currentInCart]
  );

  const [rawInput, setRawInput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsedQty = useMemo(() => parseDecimalQuantity(rawInput), [rawInput]);
  const unitPriceVes = round2(product.priceUsd * exchangeRate);
  const previewUsd = parsedQty ? round2(parsedQty * product.priceUsd) : 0;
  const previewVes = parsedQty ? round2(previewUsd * exchangeRate) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedQty || parsedQty <= 0) {
      setError('Ingresa una cantidad decimal válida mayor a 0 (ej. 0.5 o 0.25).');
      return;
    }
    if (parsedQty > remainingStock + 0.0001) {
      setError(
        `Solo quedan ${formatQuantity(remainingStock)} ${unitLabel} disponibles para agregar.`
      );
      return;
    }
    onConfirm(Math.min(parsedQty, remainingStock));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cantidad para ${product.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#84CC16]/50 bg-[#F7FEE7] text-[#558B00]">
              <Scale className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-900">{product.name}</h3>
              <p className="text-xs text-slate-500 tabular-nums">
                {formatVes(unitPriceVes)} / {unitLabel} · {formatUsd(product.priceUsd)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
              <label htmlFor="weight-qty-input" className="font-semibold text-slate-700">
                Peso / cantidad ({unitLabel})
              </label>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                Disp.: {formatQuantity(remainingStock)} {unitLabel}
              </span>
            </div>

            <div className="relative">
              <input
                ref={inputRef}
                id="weight-qty-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={rawInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9.,]*$/.test(val)) {
                    setRawInput(val);
                    if (error) setError('');
                  }
                }}
                placeholder="Ej: 0.45"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-14 text-base font-bold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                {unitLabel}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 tabular-nums">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Subtotal estimado</span>
              <span>
                {parsedQty ? `${formatQuantity(parsedQty)} ${unitLabel}` : `0 ${unitLabel}`}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-base font-extrabold text-slate-950">{formatVes(previewVes)}</p>
              <p className="font-mono text-xs font-bold text-[#3F6212]">
                {formatUsd(previewUsd)} USD
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!parsedQty || parsedQty <= 0 || remainingStock <= 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#84CC16] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar al carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface CartDecimalQtyInputProps {
  quantity: number;
  maxStock: number;
  unitLabel: string;
  onCommit: (nextQty: number) => void;
}

export const CartDecimalQtyInput: React.FC<CartDecimalQtyInputProps> = ({
  quantity,
  maxStock,
  unitLabel,
  onCommit,
}) => {
  const [draft, setDraft] = useState<string>(() => formatQuantity(quantity));
  const [focused, setFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatQuantity(quantity));
    }
  }, [quantity, focused]);

  const commitDraft = (raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '0' || normalized === '0.0' || normalized === '0.00') {
      onCommit(0);
      return;
    }
    const parsed = parseDecimalQuantity(raw);
    if (parsed !== null) {
      const clamped = Math.min(roundQty(maxStock), parsed);
      onCommit(clamped);
      setDraft(formatQuantity(clamped));
    } else {
      setDraft(formatQuantity(quantity));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`Cantidad en ${unitLabel}`}
      value={focused ? draft : formatQuantity(quantity)}
      onFocus={(e) => {
        setFocused(true);
        setDraft(formatQuantity(quantity));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const val = e.target.value;
        if (!/^[0-9.,]*$/.test(val)) return;
        setDraft(val);
        const parsed = parseDecimalQuantity(val);
        if (parsed !== null && parsed <= maxStock + 0.0001) {
          onCommit(Math.min(roundQty(maxStock), parsed));
        }
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className="h-7 w-14 bg-white px-1 text-center text-xs font-semibold tabular-nums text-slate-900 focus:outline-none"
    />
  );
};

