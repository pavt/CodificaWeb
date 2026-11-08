import { codeNameKey } from '../domain/codings';
import type {
  LinkFields,
  LinkInput,
  QuotationLink,
  RelationType,
  RelationTypeFields,
} from '../domain/relations';
import type { CodingDatabase } from './database';

function normalizeType(fields: RelationTypeFields) {
  const name = fields.name.trim().normalize('NFC');
  const { description = '', direction } = fields;
  if (
    !name ||
    name.length > 256 ||
    description.length > 16_384 ||
    (direction !== 'directed' && direction !== 'symmetric')
  )
    throw new Error('Tipo de relación no válido.');
  return { name, nameKey: codeNameKey(name), description, direction };
}

export class IndexedRelations {
  constructor(private readonly db: CodingDatabase) {}

  listTypes(projectId: string) {
    return this.db.relationTypes
      .where('projectId')
      .equals(projectId)
      .sortBy('nameKey');
  }

  async createType(projectId: string, fields: RelationTypeFields) {
    const values = normalizeType(fields);
    return this.db.transaction(
      'rw',
      [this.db.projects, this.db.relationTypes],
      async () => {
        if (!(await this.db.projects.get(projectId)))
          throw new Error('Proyecto inexistente.');
        const time = new Date().toISOString();
        const type: RelationType = {
          id: crypto.randomUUID(),
          projectId,
          ...values,
          createdAt: time,
          updatedAt: time,
        };
        await this.db.relationTypes.add(type);
        return type;
      },
    );
  }

  async updateType(projectId: string, id: string, fields: RelationTypeFields) {
    const values = normalizeType(fields);
    return this.db.transaction(
      'rw',
      [this.db.relationTypes, this.db.quotationLinks],
      async () => {
        const type = await this.requireType(projectId, id);
        if (type.direction !== values.direction)
          await this.requireUnusedType(projectId, id);
        await this.db.relationTypes.update(id, {
          ...values,
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  removeType(projectId: string, id: string) {
    return this.db.transaction(
      'rw',
      [this.db.relationTypes, this.db.quotationLinks],
      async () => {
        await this.requireType(projectId, id);
        await this.requireUnusedType(projectId, id);
        await this.db.relationTypes.delete(id);
      },
    );
  }

  createLink(projectId: string, input: LinkInput) {
    return this.db.transaction('rw', this.linkTables(), async () => {
      const values = await this.validateLink(projectId, input);
      const existing = await this.findLink(projectId, values);
      if (existing) return existing;
      const time = new Date().toISOString();
      const link: QuotationLink = {
        id: crypto.randomUUID(),
        projectId,
        ...values,
        createdAt: time,
        updatedAt: time,
      };
      await this.db.quotationLinks.add(link);
      return link;
    });
  }

  updateLink(projectId: string, id: string, fields: LinkFields) {
    return this.db.transaction('rw', this.linkTables(), async () => {
      const link = await this.requireLink(projectId, id);
      const values = await this.validateLink(projectId, { ...link, ...fields });
      const existing = await this.findLink(projectId, values);
      if (existing && existing.id !== id)
        throw new Error('El vínculo ya existe.');
      const next = { ...link, ...values, updatedAt: new Date().toISOString() };
      await this.db.quotationLinks.put(next);
      return next;
    });
  }

  removeLink(projectId: string, id: string) {
    return this.db.transaction('rw', this.db.quotationLinks, async () => {
      await this.requireLink(projectId, id);
      await this.db.quotationLinks.delete(id);
    });
  }

  private linkTables() {
    return [
      this.db.quotationLinks,
      this.db.relationTypes,
      this.db.annotations,
      this.db.sources,
    ];
  }

  private async requireType(projectId: string, id: string) {
    const type = await this.db.relationTypes.get(id);
    if (type?.projectId !== projectId)
      throw new Error('Tipo de relación fuera del proyecto.');
    return type;
  }

  private async requireUnusedType(projectId: string, id: string) {
    const used = await this.db.quotationLinks
      .where('[projectId+relationTypeId]')
      .equals([projectId, id])
      .count();
    if (used) throw new Error('El tipo de relación está en uso.');
  }

  private async requireLink(projectId: string, id: string) {
    const link = await this.db.quotationLinks.get(id);
    if (link?.projectId !== projectId)
      throw new Error('Vínculo fuera del proyecto.');
    return link;
  }

  private findLink(projectId: string, input: LinkInput) {
    return this.db.quotationLinks.get({
      '[projectId+fromAnnotationId+toAnnotationId+relationTypeId]': [
        projectId,
        input.fromAnnotationId,
        input.toAnnotationId,
        input.relationTypeId,
      ],
    });
  }

  private async validateLink(projectId: string, input: LinkInput) {
    let { fromAnnotationId, toAnnotationId } = input;
    const { relationTypeId, note = '' } = input;
    if (note.length > 16_384) throw new Error('Nota demasiado larga.');
    const type = await this.requireType(projectId, relationTypeId);
    const [from, to] = await this.db.annotations.bulkGet([
      fromAnnotationId,
      toAnnotationId,
    ]);
    if (
      from?.projectId !== projectId ||
      to?.projectId !== projectId ||
      from.sourceId === to.sourceId
    )
      throw new Error(
        'El vínculo requiere citas de fuentes distintas del proyecto.',
      );
    const [fromSource, toSource] = await this.db.sources.bulkGet([
      from.sourceId,
      to.sourceId,
    ]);
    if (
      fromSource?.projectId !== projectId ||
      toSource?.projectId !== projectId
    )
      throw new Error('Fuentes fuera del proyecto.');
    if (type.direction === 'symmetric' && fromAnnotationId > toAnnotationId)
      [fromAnnotationId, toAnnotationId] = [toAnnotationId, fromAnnotationId];
    return { fromAnnotationId, toAnnotationId, relationTypeId, note };
  }
}
