import React from 'react';
import { Minus, Pencil, Plus } from 'lucide-react';
import type { CurrencyMode, Product } from '../types/pos';
import { ProductImageBox } from './ProductImageBox';

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

interface PosProductCardProps {
  product: Product;
  stock: number;
  inCartQty: number;
  exchangeRate: number;
  currency: CurrencyMode;
  showPhoto: boolean;
  showCategory: boolean;
  showSku: boolean;
  showDualCurrency: boolean;
  canEditProduct: boolean;
  onAdd: (product: Product) => void;
  onDecrement: (productId: string) => void;
  onEdit?: (product: Product) => void;
}

export const PosProductCard: React.FC<PosProductCardProps> = ({
  product,
  stock,
  inCartQty,
  exchangeRate,
  currency,
  showPhoto,
  showCategory,
  showSku,
  showDualCurrency,
  canEditProduct,
  onAdd,
  onDecrement,
  onEdit,
}) => {
  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  const priceVes = round2(product.priceUsd * safeRate);
  const outOfStock = stock <= 0;
  const lowStock = stock > 0 && stock <= product.minStock;
  const reachedMaxStock = inCartQty >= stock;

  const primaryPrice = currency === 'USD' ? formatUsd(product.priceUsd) : formatVes(priceVes);
  const secondaryPrice = currency === 'USD' ? formatVes(priceVes) : formatUsd(product.priceUsd);

  const metaParts: string[] = [];
  if (showSku && product.sku) {
    metaParts.push(product.sku);
  }
  if (showCategory && product.category) {
    metaParts.push(product.category);
  }
  if (product.taxExempt) {
    metaParts.push('Exento');
  }

  return (
    <article
      className={`flex items-stretch gap-2.5 rounded-lg border p-2 shadow-2xs transition-all ${
        outOfStock
          ? 'border-slate-200 bg-slate-50/80 opacity-70'
          : inCartQty > 0
          ? 'border-[#76B900] bg-[#F7FEE7]/35 ring-1 ring-[#84CC16]/30'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {showPhoto && (
        <button
          type="button"
          disabled={outOfStock || reachedMaxStock}
          onClick={() => onAdd(product)}
          aria-label={`Agregar ${product.name} al carrito`}
          className="w-20 sm:w-[88px] shrink-0 self-center rounded-md focus:outline-none focus:ring-2 focus:ring-[#84CC16]/60 disabled:cursor-not-allowed cursor-pointer"
        >
          <ProductImageBox
            src={product.imageUrl || product.image_url}
            name={product.name}
            fit="contain"
            className="aspect-[3/4] w-full rounded-md bg-slate-50"
          />
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="space-y-0.5">
          <div className="flex items-start justify-between gap-1.5">
            <h2 className="text-xs font-bold leading-snug text-slate-900 line-clamp-2">
              {product.name}
            </h2>
            {canEditProduct && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(product)}
                title="Editar producto en Stock"
                aria-label={`Editar ${product.name}`}
                className="shrink-0 rounded border border-slate-200 bg-white p-1 text-slate-500 hover:border-[#76B900] hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {metaParts.length > 0 && (
            <p className="truncate text-[11px] text-slate-500">
              {metaParts.join(' · ')}
            </p>
          )}

          <p className="text-[11px] tabular-nums">
            <span className="text-slate-500">Stock: </span>
            {outOfStock ? (
              <span className="font-semibold text-red-600">0 (Agotado)</span>
            ) : lowStock ? (
              <span className="font-semibold text-amber-700">
                {stock} {product.unit} (Bajo)
              </span>
            ) : (
              <span className="font-medium text-slate-600">
                {stock} {product.unit}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-end justify-between gap-2 border-t border-slate-100 pt-1.5">
          <div className="min-w-0 font-mono tabular-nums">
            <p
              className={`truncate text-xs font-bold ${
                currency === 'VES' ? 'text-[#558B00]' : 'text-slate-900'
              }`}
            >
              {primaryPrice}
            </p>
            {showDualCurrency && (
              <p
                className={`truncate text-[11px] ${
                  currency === 'USD' ? 'font-semibold text-[#558B00]' : 'text-slate-500'
                }`}
              >
                {secondaryPrice}
              </p>
            )}
          </div>

          {outOfStock ? (
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-400">
              Agotado
            </span>
          ) : (
            <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                disabled={inCartQty <= 0}
                onClick={() => onDecrement(product.id)}
                aria-label={`Disminuir cantidad de ${product.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[20px] px-0.5 text-center font-mono text-xs font-bold tabular-nums text-slate-900">
                {inCartQty}
              </span>
              <button
                type="button"
                disabled={reachedMaxStock}
                onClick={() => onAdd(product)}
                aria-label={`Agregar ${product.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#84CC16] text-slate-950 hover:bg-[#76B900] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
