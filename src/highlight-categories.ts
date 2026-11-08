import { isRecord } from './capture-contract';
import type { HighlightCategory } from './domain/codings';

export function readHighlightCategories(value: unknown): HighlightCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((category: unknown) => {
    if (!isRecord(category)) return [];
    const { id, name, color } = category;
    return typeof id === 'string' &&
      typeof name === 'string' &&
      typeof color === 'string' &&
      /^#[0-9a-f]{6}$/i.test(color)
      ? [{ id, name, color }]
      : [];
  });
}

export function categoryLabel({ name, color }: HighlightCategory) {
  const label = document.createElement('span');
  const swatch = document.createElement('span');
  swatch.className = 'citation-swatch';
  swatch.style.backgroundColor = color;
  swatch.setAttribute('aria-hidden', 'true');
  label.className = 'citation-category';
  label.append(swatch, name);
  return label;
}
