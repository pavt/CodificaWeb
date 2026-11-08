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
