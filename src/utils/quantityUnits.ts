const WEIGHT_OR_VOLUME_UNITS = new Set([
  'kg',
  'kilo',
  'kilos',
  'kilogramo',
  'kilogramos',
  'g',
  'gr',
  'gramo',
  'gramos',
  'l',
  'lt',
  'lts',
  'litro',
  'litros',
  'ml',
  'mililitro',
  'mililitros',
  'lb',
  'libra',
  'libras',
  'oz',
  'onza',
  'onzas',
]);

export function normalizeUnitKey(unit?: string | null): string {
  if (!unit) return '';
  return unit
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isWeightOrVolumeUnit(unit?: string | null): boolean {
  const key = normalizeUnitKey(unit);
  if (!key || key === 'und' || key === 'unidad' || key === 'unidades') {
    return false;
  }
  return WEIGHT_OR_VOLUME_UNITS.has(key);
}

export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function formatQuantity(qty: number): string {
  const rounded = roundQty(qty);
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(3).replace(/\.?0+$/, '');
}

export function getQuantityStep(unit?: string | null): number {
  const key = normalizeUnitKey(unit);
  if (!isWeightOrVolumeUnit(key)) return 1;
  if (key === 'g' || key === 'gr' || key === 'gramo' || key === 'gramos' || key === 'ml' || key === 'mililitro' || key === 'mililitros') {
    return 0.5;
  }
  return 0.25;
}

export function getWeightPresets(unit?: string | null): number[] {
  const key = normalizeUnitKey(unit);
  if (key === 'g' || key === 'gr' || key === 'gramo' || key === 'gramos' || key === 'ml' || key === 'mililitro' || key === 'mililitros') {
    return [100, 250, 500, 1000];
  }
  return [0.25, 0.5, 0.75, 1];
}

export function parseDecimalQuantity(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return roundQty(parsed);
}
