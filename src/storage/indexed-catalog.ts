import { nextCategoryColor } from '../domain/category-colors';
import { codeNameKey } from '../domain/codings';
import type { CodingDatabase } from './database';

export interface CodeFields {
  name: string;
  description: string;
}

function normalize(fields: CodeFields) {
  const name = fields.name.trim().normalize('NFC');
  if (!name || name.length > 256 || fields.description.length > 16_384)
    throw new Error('Código no válido.');
  return {
    name,
    description: fields.description,
    nameKey: codeNameKey(name),
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
        const existing = await this.db.codes
          .where('projectId')
          .equals(projectId)
          .toArray();
        const color = nextCategoryColor(existing.map((code) => code.color));
        const id = crypto.randomUUID();
        const time = new Date().toISOString();
        await this.db.codes.add({
          id,
          projectId,
          ...values,
          color,
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
