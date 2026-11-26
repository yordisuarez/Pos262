import { getSafeProductImageUrl } from '../services/productImage';

interface FlyToCartOptions {
  sourceEl: HTMLElement | null;
  targetEl: HTMLElement | null;
  imageUrl?: string | null;
  productName: string;
  showPhoto?: boolean;
}

const FLIGHT_DURATION_MS = 340;
const CLEANUP_BUFFER_MS = 140;
const MAX_CONCURRENT_CLONES = 12;

let activeCloneCount = 0;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pulseCartTarget(targetEl: HTMLElement): void {
  if (!targetEl.isConnected) return;

  targetEl.classList.remove('pos-cart-arrive');
  window.requestAnimationFrame(() => {
    if (!targetEl.isConnected) return;
    targetEl.classList.add('pos-cart-arrive');

    const clearPulse = () => {
      targetEl.classList.remove('pos-cart-arrive');
    };

    targetEl.addEventListener('animationend', clearPulse, { once: true });
    window.setTimeout(clearPulse, 320);
  });
}

function evalQuadBezier(p0: number, p1: number, p2: number, t: number): number {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2;
}

export function triggerFlyToCart({
  sourceEl,
  targetEl,
  imageUrl,
  productName,
  showPhoto = false,
}: FlyToCartOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!sourceEl || !targetEl) return;
  if (prefersReducedMotion()) return;
  if (activeCloneCount >= MAX_CONCURRENT_CLONES) return;

  const targetRect = targetEl.getBoundingClientRect();
  if (targetRect.width <= 0 || targetRect.height <= 0) return;

  const imgInsideSource = showPhoto ? sourceEl.querySelector('img') : null;
  const imgRect = imgInsideSource ? imgInsideSource.getBoundingClientRect() : null;
  const sourceRect =
    imgRect && imgRect.width > 0 && imgRect.height > 0
      ? imgRect
      : sourceEl.getBoundingClientRect();

  if (sourceRect.width <= 0 || sourceRect.height <= 0) return;

  const safeImgUrl = showPhoto ? getSafeProductImageUrl(imageUrl ?? undefined) : null;

  const clone = document.createElement('div');
  clone.className = 'pos-fly-clone';
  clone.setAttribute('aria-hidden', 'true');

  let cloneWidth: number;
  let cloneHeight: number;

  if (safeImgUrl) {
    cloneWidth = 48;
    cloneHeight = 48;
    clone.style.width = `${cloneWidth}px`;
    clone.style.height = `${cloneHeight}px`;
    clone.style.borderRadius = '12px';
    clone.style.backgroundColor = '#ffffff';
    clone.style.border = '2px solid #84CC16';
    clone.style.boxShadow = '0 8px 20px -6px rgba(15, 23, 42, 0.22)';
    clone.style.overflow = 'hidden';

    const img = document.createElement('img');
    img.src = safeImgUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    clone.appendChild(img);
  } else {
    const shortName = productName.trim().slice(0, 11);
    cloneWidth = shortName ? 104 : 44;
    cloneHeight = 28;
    clone.style.width = `${cloneWidth}px`;
    clone.style.height = `${cloneHeight}px`;
    clone.style.padding = '0 8px';
    clone.style.borderRadius = '10px';
    clone.style.backgroundColor = '#F7FEE7';
    clone.style.border = '1.5px solid #84CC16';
    clone.style.color = '#3F6212';
    clone.style.boxShadow = '0 8px 18px -6px rgba(15, 23, 42, 0.18)';
    clone.style.display = 'inline-flex';
    clone.style.alignItems = 'center';
    clone.style.justifyContent = 'center';
    clone.style.gap = '4px';
    clone.style.fontSize = '11px';
    clone.style.fontWeight = '700';
    clone.style.whiteSpace = 'nowrap';
    clone.style.overflow = 'hidden';

    const plusSpan = document.createElement('span');
    plusSpan.textContent = '+1';
    plusSpan.style.color = '#558B00';
    plusSpan.style.flexShrink = '0';

    clone.appendChild(plusSpan);
    if (shortName) {
      const labelSpan = document.createElement('span');
      labelSpan.textContent = shortName;
      labelSpan.style.overflow = 'hidden';
      labelSpan.style.textOverflow = 'ellipsis';
      clone.appendChild(labelSpan);
    }
  }

  const startX = sourceRect.left + sourceRect.width / 2 - cloneWidth / 2;
  const startY = sourceRect.top + sourceRect.height / 2 - cloneHeight / 2;
  const endX = targetRect.left + targetRect.width / 2 - cloneWidth / 2;
  const endY = targetRect.top + targetRect.height / 2 - cloneHeight / 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);

  // Smooth upward quadratic Bézier arc proportional to travel distance
  const arcLift = Math.min(110, Math.max(36, distance * 0.24));
  const ctrlX = dx * 0.48;
  const ctrlY = Math.min(0, dy) - arcLift;

  const x25 = evalQuadBezier(0, ctrlX, dx, 0.25);
  const y25 = evalQuadBezier(0, ctrlY, dy, 0.25);
  const x50 = evalQuadBezier(0, ctrlX, dx, 0.5);
  const y50 = evalQuadBezier(0, ctrlY, dy, 0.5);
  const x75 = evalQuadBezier(0, ctrlX, dx, 0.75);
  const y75 = evalQuadBezier(0, ctrlY, dy, 0.75);

  clone.style.left = `${startX}px`;
  clone.style.top = `${startY}px`;
  clone.style.setProperty('--fly-x25', `${x25.toFixed(1)}px`);
  clone.style.setProperty('--fly-y25', `${y25.toFixed(1)}px`);
  clone.style.setProperty('--fly-x50', `${x50.toFixed(1)}px`);
  clone.style.setProperty('--fly-y50', `${y50.toFixed(1)}px`);
  clone.style.setProperty('--fly-x75', `${x75.toFixed(1)}px`);
  clone.style.setProperty('--fly-y75', `${y75.toFixed(1)}px`);
  clone.style.setProperty('--fly-end-x', `${dx.toFixed(1)}px`);
  clone.style.setProperty('--fly-end-y', `${dy.toFixed(1)}px`);
  clone.style.setProperty('--fly-duration', `${FLIGHT_DURATION_MS}ms`);

  activeCloneCount += 1;
  document.body.appendChild(clone);

  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    activeCloneCount = Math.max(0, activeCloneCount - 1);
    clone.remove();
    pulseCartTarget(targetEl);
  };

  clone.addEventListener('animationend', cleanup, { once: true });
  clone.addEventListener('transitionend', cleanup, { once: true });
  window.setTimeout(cleanup, FLIGHT_DURATION_MS + CLEANUP_BUFFER_MS);
}
