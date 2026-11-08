export interface SearchFilters {
  text: string;
  sourceId: string | null;
  codeId: string | null;
}

export interface EvidenceMatch {
  sourceId: string;
  quote: string;
  note: string | null;
  codes: readonly { id: string; name: string }[];
}

export interface EvidenceResult extends EvidenceMatch {
  id: string;
  url: string;
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFC');
}

export function filterEvidence<T extends EvidenceMatch>(
  rows: readonly T[],
  filters: SearchFilters,
) {
  const query = normalize(filters.text.trim());
  return rows.filter(
    (row) =>
      (filters.sourceId === null || row.sourceId === filters.sourceId) &&
      (filters.codeId === null ||
        row.codes.some(({ id }) => id === filters.codeId)) &&
      (!query ||
        normalize(row.quote).includes(query) ||
        (row.note !== null && normalize(row.note).includes(query))),
  );
}
