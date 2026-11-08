export interface CaptureTarget {
  tabId: number;
  documentId: string;
  url: string;
}

export interface SelectionSnapshot {
  kind: 'selection';
  url: string;
  revision: number;
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

export type CaptureResult =
  SelectionSnapshot | { kind: 'empty' | 'excluded' | 'stale' | 'too-large' };
