export function resolveAnchor(
  text: string,
  exact: string,
  prefix: string,
  suffix: string,
) {
  if (!exact) return undefined;
  const first = text.indexOf(exact);
  if (first < 0) return undefined;
  const next = text.indexOf(exact, first + 1);
  if (next < 0) return { start: first, end: first + exact.length };
  if (!prefix && !suffix) return undefined;

  let match: number | undefined;
  for (
    let offset = first;
    offset >= 0;
    offset = text.indexOf(exact, offset + 1)
  ) {
    const end = offset + exact.length;
    if (
      offset >= prefix.length &&
      text.slice(offset - prefix.length, offset) === prefix &&
      text.slice(end, end + suffix.length) === suffix
    ) {
      if (match !== undefined) return undefined;
      match = offset;
    }
  }
  return match === undefined
    ? undefined
    : { start: match, end: match + exact.length };
}
