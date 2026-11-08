import { codeNameKey } from '../domain/codings';
import type {
  LinkFields,
  LinkedCitation,
  LinkedSource,
  RelationEvidence,
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

  createWithType(
    projectId: string,
    endpoints: Omit<LinkInput, 'relationTypeId'>,
    fields: RelationTypeFields,
  ) {
    const values = normalizeType(fields);
    return this.db.transaction(
      'rw',
      [...this.linkTables(), this.db.projects],
      async () => {
        const previous = await this.db.relationTypes.get({
          '[projectId+nameKey]': [projectId, values.nameKey],
        });
        if (previous) {
          if (
            previous.name === values.name &&
            previous.description === values.description &&
            previous.direction === values.direction
          ) {
            const input = await this.validateLink(projectId, {
              ...endpoints,
              relationTypeId: previous.id,
            });
            const link = await this.findLink(projectId, input);
            if (link && link.note === input.note) return link;
          }
          throw new Error('Ya existe un tipo con ese nombre.');
        }
        const type = await this.createType(projectId, fields);
        return this.createLink(projectId, {
          ...endpoints,
          relationTypeId: type.id,
        });
      },
    );
  }

  listByCitation(projectId: string, annotationId: string) {
    return this.db.transaction('r', this.linkTables(), async () => {
      const annotation = await this.db.annotations.get(annotationId);
      if (annotation?.projectId !== projectId)
        throw new Error('Cita fuera del proyecto.');
      return this.evidenceFor(projectId, [annotationId]);
    });
  }

  listBySource(projectId: string, sourceId: string) {
    return this.db.transaction('r', this.linkTables(), async () => {
      if ((await this.db.sources.get(sourceId))?.projectId !== projectId)
        throw new Error('Fuente fuera del proyecto.');
      const ids = await this.db.annotations
        .where('[projectId+sourceId]')
        .equals([projectId, sourceId])
        .primaryKeys();
      const evidence = await this.evidenceFor(projectId, ids);
      const groups = new Map<
        string,
        { source: LinkedSource; links: RelationEvidence[] }
      >();
      for (const link of evidence) {
        const source =
          link.from.source.id === sourceId ? link.to.source : link.from.source;
        let group = groups.get(source.id);
        if (!group) {
          group = { source, links: [] };
          groups.set(source.id, group);
        }
        group.links.push(link);
      }
      return [...groups.values()].sort((a, b) =>
        a.source.url.localeCompare(b.source.url),
      );
    });
  }

  private async evidenceFor(
    projectId: string,
    ids: string[],
  ): Promise<RelationEvidence[]> {
    const { quotationLinks, annotations, sources, relationTypes } = this.db;
    const keys = ids.map((id) => [projectId, id]);
    const [outgoing, incoming] = await Promise.all([
      quotationLinks
        .where('[projectId+fromAnnotationId]')
        .anyOf(keys)
        .toArray(),
      quotationLinks.where('[projectId+toAnnotationId]').anyOf(keys).toArray(),
    ]);
    const links = [
      ...new Map(
        [...outgoing, ...incoming].map((link) => [link.id, link]),
      ).values(),
    ];
    const [quotes, types] = await Promise.all([
      annotations.bulkGet([
        ...new Set(
          links.flatMap((link) => [link.fromAnnotationId, link.toAnnotationId]),
        ),
      ]),
      relationTypes.bulkGet([
        ...new Set(links.map((link) => link.relationTypeId)),
      ]),
    ]);
    const sourceRows = await sources.bulkGet([
      ...new Set(
        quotes.flatMap((quote) =>
          quote?.projectId === projectId ? [quote.sourceId] : [],
        ),
      ),
    ]);
    const sourceById = new Map(
      sourceRows.flatMap((source) =>
        source?.projectId === projectId ? [[source.id, source] as const] : [],
      ),
    );
    const quoteById = new Map<string, LinkedCitation>();
    for (const quote of quotes) {
      if (quote?.projectId !== projectId) continue;
      const source = sourceById.get(quote.sourceId);
      if (!source) continue;
      const { id, url, title } = source;
      quoteById.set(quote.id, {
        id: quote.id,
        source: { id, url, title },
        quote: quote.selectors.quote.exact,
      });
    }
    const typeById = new Map(
      types.flatMap((type) =>
        type?.projectId === projectId ? [[type.id, type] as const] : [],
      ),
    );
    const starts = new Set(ids);
    return links.flatMap((link) => {
      const from = quoteById.get(link.fromAnnotationId);
      const to = quoteById.get(link.toAnnotationId);
      const type = typeById.get(link.relationTypeId);
      if (!from || !to || !type) return [];
      const direction =
        type.direction === 'symmetric'
          ? 'symmetric'
          : starts.has(from.id)
            ? 'outgoing'
            : 'incoming';
      return [{ ...link, type, from, to, direction }];
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
