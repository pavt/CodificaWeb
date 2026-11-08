export interface RelationTypeFields {
  name: string;
  description?: string;
  direction: 'directed' | 'symmetric';
}

interface ProjectRecord {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationType extends ProjectRecord, RelationTypeFields {
  nameKey: string;
}

export interface LinkFields {
  relationTypeId: string;
  note?: string;
}

export interface LinkInput extends LinkFields {
  fromAnnotationId: string;
  toAnnotationId: string;
}

export type QuotationLink = ProjectRecord & LinkInput;

export interface LinkedSource {
  id: string;
  title: string;
  url: string;
}

export interface LinkedCitation {
  id: string;
  source: LinkedSource;
  quote: string;
}

export interface RelationEvidence extends QuotationLink {
  type: RelationType;
  from: LinkedCitation;
  to: LinkedCitation;
  direction: 'outgoing' | 'incoming' | 'symmetric';
}
