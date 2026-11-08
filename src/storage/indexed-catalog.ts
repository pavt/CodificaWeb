import { codeNameKey } from '../domain/codings';
import type { CodingDatabase } from './database';

export interface CodeFields {
  name: string;
  description: string;
  color: string;
}

function normalize(fields: CodeFields) {
  const name = fields.name.trim().normalize('NFC');
  if (
    !name ||
    name.length > 256 ||
    fields.description.length > 16_384 ||
    !/^#[0-9a-f]{6}$/i.test(fields.color)
  )
    throw new Error('Código no válido.');
  return {
    ...fields,
    name,
    nameKey: codeNameKey(name),
    color: fields.color.toUpperCase(),
  };
}

export class IndexedCatalog {
  constructor(private readonly db: CodingDatabase) {}

  list(projectId: string) {
    return this.db.codes.where('projectId').equals(projectId).sortBy('nameKey');
  }

  create(projectId: string, fields: CodeFields) {
    const values = normalize(fields);
    return this.db.transaction(
      'rw',
      [this.db.projects, this.db.codes],
      async () => {
        if (!(await this.db.projects.get(projectId)))
          throw new Error('Proyecto inexistente.');
        const id = crypto.randomUUID();
        const time = new Date().toISOString();
        await this.db.codes.add({
          id,
          projectId,
          ...values,
          createdAt: time,
          updatedAt: time,
        });
        return id;
      },
    );
  }

  update(projectId: string, id: string, fields: CodeFields) {
    const values = normalize(fields);
    return this.db.transaction('rw', this.db.codes, async () => {
      if ((await this.db.codes.get(id))?.projectId !== projectId)
        throw new Error('Código fuera del proyecto.');
      await this.db.codes.update(id, {
        ...values,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  remove(projectId: string, id: string) {
    return this.db.transaction(
      'rw',
      [this.db.codes, this.db.codings],
      async () => {
        if ((await this.db.codes.get(id))?.projectId !== projectId)
          throw new Error('Código fuera del proyecto.');
        await this.db.codings
          .where('[projectId+codeId]')
          .equals([projectId, id])
          .delete();
        await this.db.codes.delete(id);
      },
    );
  }
}
