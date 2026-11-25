import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { getSafeProductImageUrl } from '../services/productImage';

interface ProductImageBoxProps {
  src?: string | null;
  name?: string;
  alt?: string;
  allowBlobPreview?: boolean;
  className?: string;
  showInitials?: boolean;
}

function getProductInitials(name?: string): string {
  if (!name) return '';
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9\u00C0-\u024F]/.test(w));
  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export const ProductImageBox: React.FC<ProductImageBoxProps> = ({
  src,
  name,
  alt,
  allowBlobPreview = false,
  className = 'h-14 w-full rounded',
  showInitials = true,
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const trimmed = src?.trim() || '';
  const safeSrc =
    allowBlobPreview && trimmed.startsWith('blob:')
      ? trimmed
      : getSafeProductImageUrl(trimmed);

  const shouldRenderImg = Boolean(safeSrc && failedSrc !== safeSrc);
  const initials = showInitials ? getProductInitials(name) : '';

  return (
    <div
      className={`flex items-center justify-center overflow-hidden border border-slate-200 bg-slate-50 text-slate-400 ${className}`}
    >
      {shouldRenderImg && safeSrc ? (
        <img
          src={safeSrc}
          alt={alt || name || 'Producto'}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(safeSrc)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex items-center justify-center gap-1 text-slate-400 select-none"
        >
          <Package className="h-4 w-4 shrink-0 text-slate-400" />
          {initials && (
            <span className="font-mono text-[11px] font-bold tracking-tight text-slate-500">
              {initials}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
