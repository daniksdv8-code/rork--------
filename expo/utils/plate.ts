export function formatPlateNumber(plate: string): string {
  return plate
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[ёЁ]/g, 'Е')
    .trim();
}

export function isValidPlate(plate: string): boolean {
  const formatted = formatPlateNumber(plate);
  return formatted.length >= 4 && formatted.length <= 12;
}
