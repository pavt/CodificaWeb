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
  description?: string;
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

export function codeNameKey(name: string) {
  return name.trim().toLowerCase().normalize('NFC');
}
