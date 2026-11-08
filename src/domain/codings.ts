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

export class MemoryCodings {
  private readonly assignments = new Map<string, Set<string>>();

  constructor(private readonly catalog: readonly Code[]) {}

  read(projectId: string, fragment: Fragment): CodeAssignment[] {
    const assigned = this.assignments.get(
      JSON.stringify([projectId, fragmentKey(fragment)]),
    );
    return this.catalog
      .filter((code) => code.projectId === projectId)
      .map((code) => ({ ...code, assigned: assigned?.has(code.id) ?? false }));
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
    const codes = this.assignments.get(key) ?? new Set<string>();
    if (assigned) codes.add(codeId);
    else codes.delete(codeId);
    if (codes.size) this.assignments.set(key, codes);
    else this.assignments.delete(key);
    return this.read(projectId, fragment);
  }
}
