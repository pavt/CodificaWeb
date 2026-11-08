import { isRecord } from './capture-contract';
import type { HighlightCategory } from './domain/codings';

export function readHighlightCategories(value: unknown): HighlightCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((category: unknown) => {
    if (!isRecord(category)) return [];
    const { id, name, color, description } = category;
    return typeof id === 'string' &&
      typeof name === 'string' &&
      typeof color === 'string' &&
      /^#[0-9a-f]{6}$/i.test(color)
      ? [
          {
            id,
            name,
            color,
            description: typeof description === 'string' ? description : '',
          },
        ]
      : [];
  });
}

export function categorySwatch(color: string) {
  const swatch = document.createElement('span');
  swatch.className = 'citation-swatch';
  swatch.style.backgroundColor = color;
  swatch.setAttribute('aria-hidden', 'true');
  return swatch;
}

export function categoryLabel(
  { id, name, color }: HighlightCategory,
  activate: () => void,
) {
  const label = document.createElement('button');
  label.type = 'button';
  label.dataset.category = id;
  label.addEventListener('click', activate);
  label.className = 'citation-category';
  label.append(categorySwatch(color), name);
  return label;
}
