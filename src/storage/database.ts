import { Dexie } from 'dexie';
import type { Table } from 'dexie';
import type { Code, Fragment } from '../domain/codings';

interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends Entity {
  name: string;
  description: string;
}

interface Source extends Entity {
  projectId: string;
  url: string;
  title: string;
  capturedAt: string;
}

interface StoredCode extends Code, Entity {
  nameKey: string;
  description: string;
}

interface Annotation extends Entity {
  projectId: string;
  sourceId: string;
  start: number;
  end: number;
  selectors: Fragment['selectors'];
  note?: string;
}

interface Coding extends Entity {
  projectId: string;
  annotationId: string;
  codeId: string;
}

interface Operation {
  projectId?: string;
  id: string;
  fingerprint: string;
}

export const initialProjectId = '00000000-0000-4000-8000-000000000001';

export class CodingDatabase extends Dexie {
  declare projects: Table<Project, string>;
  declare sources: Table<Source, string>;
  declare codes: Table<StoredCode, string>;
  declare annotations: Table<Annotation, string>;
  declare codings: Table<Coding, string>;
  declare preferences: Table<{ key: string; value: string }, string>;
  declare sites: Table<{ origin: string }, string>;
  declare operations: Table<Operation, string>;

  constructor(name = 'codificaweb') {
    super(name, { chromeTransactionDurability: 'strict' });
    this.version(1).stores({
      projects: 'id',
      sources: 'id, &[projectId+url], projectId',
      codes: 'id, &[projectId+nameKey], projectId',
      annotations: 'id, [projectId+sourceId], [sourceId+start+end], projectId',
      codings:
        'id, &[annotationId+codeId], [projectId+codeId], [projectId+annotationId], annotationId',
      operations: 'id',
    });
    this.version(2).stores({ sites: 'origin' });
    this.version(3)
      .stores({ preferences: 'key', operations: 'id, projectId' })
      .upgrade((tx) =>
        tx
          .table<Operation>('operations')
          .toCollection()
          .modify((operation) => {
            const fingerprint: unknown = JSON.parse(operation.fingerprint);
            if (Array.isArray(fingerprint)) {
              const projectId: unknown =
                fingerprint[fingerprint[0] === 'note' ? 1 : 0];
              if (typeof projectId === 'string')
                operation.projectId = projectId;
            }
          }),
      );
    this.on('populate', async () => {
      const time = new Date().toISOString();
      await this.projects.add({
        id: initialProjectId,
        name: 'Proyecto inicial',
        description: '',
        createdAt: time,
        updatedAt: time,
      });
      await this.codes.bulkAdd(
        [
          {
            id: '00000000-0000-4000-8000-000000000003',
            name: 'Tema',
            color: '#FDD835',
          },
          {
            id: '00000000-0000-4000-8000-000000000004',
            name: 'Contexto',
            color: '#81D4FA',
          },
        ].map((code) => ({
          ...code,
          projectId: initialProjectId,
          nameKey: code.name.toLowerCase(),
          description: '',
          createdAt: time,
          updatedAt: time,
        })),
      );
    });
  }
}
