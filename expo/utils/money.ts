export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value: number): string {
  const rounded = roundMoney(value);
  if (rounded === Math.floor(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(2);
}
