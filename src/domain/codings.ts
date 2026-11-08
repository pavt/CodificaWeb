export interface Fragment {
  url: string;
  selectors: {
    profile: 'dom-text-v1';
    quote: {
      type: 'TextQuoteSelector';
      exact: string;
      prefix: string;
      suffix: string;
    };
    position: { type: 'TextPositionSelector'; start: number; end: number };
  };
}

export interface Code {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface CodeAssignment extends Code {
  assigned: boolean;
}

export function fragmentKey(fragment: Fragment): string {
  const { position, quote } = fragment.selectors;
  return JSON.stringify([
    fragment.url,
    position.start,
    position.end,
    quote.exact,
    quote.prefix,
    quote.suffix,
  ]);
}

export interface HighlightEntry {
  id: string;
  selectors: Fragment['selectors'];
  color: string;
}

export class MemoryCodings {
  private readonly assignments = new Map<
    string,
    { projectId: string; fragment: Fragment; codes: Set<string> }
  >();

  constructor(private readonly catalog: readonly Code[]) {}

  read(projectId: string, fragment: Fragment): CodeAssignment[] {
    const assigned = this.assignments.get(
      JSON.stringify([projectId, fragmentKey(fragment)]),
    );
    return this.catalog
      .filter((code) => code.projectId === projectId)
      .map((code) => ({
        ...code,
        assigned: assigned?.codes.has(code.id) ?? false,
      }));
  }

  highlights(
    projectId: string,
    url: string,
    filter: string | null,
  ): HighlightEntry[] {
    const entries: HighlightEntry[] = [];
    for (const [id, entry] of this.assignments) {
      if (entry.projectId !== projectId || entry.fragment.url !== url) continue;
      const code = this.catalog
        .filter(
          (code) =>
            code.projectId === projectId &&
            entry.codes.has(code.id) &&
            (filter === null || filter === code.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (code)
        entries.push({
          id,
          selectors: entry.fragment.selectors,
          color: code.color,
        });
    }
    return entries;
  }

  set(
    projectId: string,
    fragment: Fragment,
    codeId: string,
    assigned: boolean,
  ): CodeAssignment[] {
    if (
      !this.catalog.some(
        (code) => code.id === codeId && code.projectId === projectId,
      )
    ) {
      throw new Error('Código fuera del proyecto.');
    }

    const key = JSON.stringify([projectId, fragmentKey(fragment)]);
    const codes = this.assignments.get(key)?.codes ?? new Set<string>();
    if (assigned) codes.add(codeId);
    else codes.delete(codeId);
    if (codes.size) this.assignments.set(key, { projectId, fragment, codes });
    else this.assignments.delete(key);
    return this.read(projectId, fragment);
  }
}
