interface ColoredRange {
  start: number;
  end: number;
  color: string;
}

interface AnnotationRange extends ColoredRange {
  id: string;
}

export function segmentHighlights(
  ranges: readonly AnnotationRange[],
): ColoredRange[] {
  const priority = [...ranges].sort(
    (a, b) =>
      a.end - a.start - (b.end - b.start) ||
      (a.id < b.id ? -1 : Number(a.id !== b.id)),
  );
  const boundaries = [
    ...new Set(ranges.flatMap(({ start, end }) => [start, end])),
  ].sort((a, b) => a - b);
  const segments: ColoredRange[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1];
    const end = boundaries[i];
    if (start === undefined || end === undefined) continue;
    const winner = priority.find(
      (range) => range.start <= start && range.end >= end,
    );
    if (!winner) continue;
    const previous = segments.at(-1);
    if (previous?.end === start && previous.color === winner.color)
      previous.end = end;
    else segments.push({ start, end, color: winner.color });
  }
  return segments;
}
