// ColorBrewer Accent and Set3 by Cynthia Brewer, Mark Harrower and Penn State.
// Source: https://github.com/axismaps/colorbrewer/blob/master/colorbrewer_schemes.js
// License and attribution: public/licenses/colorbrewer.txt
export const accentColors = [
  '#7FC97F',
  '#BEAED4',
  '#FDC086',
  '#FFFF99',
  '#386CB0',
  '#F0027F',
  '#BF5B17',
  '#666666',
] as const;

const set3Colors = [
  '#8DD3C7',
  '#FFFFB3',
  '#BEBADA',
  '#FB8072',
  '#80B1D3',
  '#FDB462',
  '#B3DE69',
  '#FCCDE5',
  '#D9D9D9',
  '#BC80BD',
  '#CCEBC5',
  '#FFED6F',
] as const;

export function nextCategoryColor(existingColors: readonly string[]): string {
  const used = new Set(existingColors.map((color) => color.toUpperCase()));
  for (const color of [...accentColors, ...set3Colors]) {
    if (!used.has(color)) return color;
  }

  // An odd stride visits each 21-bit value once. Spread those bits across
  // the RGB channels and keep the generated colors light enough for highlights.
  for (let index = 1; index <= 0x200000; index++) {
    const bits = (index * 0x1e3779) & 0x1fffff;
    const rgb =
      0x808080 |
      ((bits & 0x1fc000) << 2) |
      ((bits & 0x3f80) << 1) |
      (bits & 0x7f);
    const color = '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
    if (!used.has(color)) return color;
  }
  throw new Error('Se agotaron los colores disponibles.');
}
