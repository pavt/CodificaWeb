export interface WebDocument {
  id: string;
  format: 'web';
  title: string;
  url: string;
}

// Add formats here when their storage and citation anchors are supported.
export type ProjectDocument = WebDocument;
