// Reference solution for case A. Never sent to a model: only the offline check runs it.
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('formatPrice expects a finite number');
  }
  return value.toFixed(2);
}
