import { codeNameKey } from '../domain/codings';
import { decodeProjectFile } from '../domain/project-file';
import { orderLinkEndpoints } from '../domain/relations';
import type { CodingDatabase } from './database';

export class ProjectTransfer {
  constructor(private readonly db: CodingDatabase) {}

  exportProject(id: string) {
    const { db } = this;
    return db.transaction(
      'r',
      [
        db.projects,
        db.sources,
        db.codes,
        db.annotations,
        db.codings,
        db.relationTypes,
        db.quotationLinks,
      ],
      async () => {
        const project = await db.projects.get(id);
        if (!project) throw new Error('Proyecto inexistente.');
        const sources = await db.sources
          .where('projectId')
          .equals(id)
          .toArray();
        const codes = (
          await db.codes.where('projectId').equals(id).toArray()
        ).map(
          ({
            id,
            projectId,
            name,
            description,
            color,
            createdAt,
            updatedAt,
          }) => ({
            id,
            projectId,
            name,
            description,
            color,
            createdAt,
            updatedAt,
          }),
        );
        const annotations = (
          await db.annotations.where('projectId').equals(id).toArray()
        ).map(
          ({
            id,
            projectId,
            sourceId,
            selectors,
            note,
            createdAt,
            updatedAt,
          }) => ({
            id,
            projectId,
            sourceId,
            selectors,
            ...(note === undefined ? {} : { note }),
            createdAt,
            updatedAt,
          }),
        );
        const codings = await db.codings
          .where('[projectId+annotationId]')
          .between([id, ''], [id, '\uffff'])
          .toArray();
        const relationTypes = (
          await db.relationTypes.where('projectId').equals(id).toArray()
        ).map(
          ({
            id,
            projectId,
            name,
            description,
            direction,
            createdAt,
            updatedAt,
          }) => ({
            id,
            projectId,
            name,
            description,
            direction,
            createdAt,
            updatedAt,
          }),
        );
        const quotationLinks = await db.quotationLinks
          .where('projectId')
          .equals(id)
          .toArray();
        return {
          schemaVersion: 2 as const,
          exportedAt: new Date().toISOString(),
          project,
          sources,
          codes,
          annotations,
          codings,
          relationTypes,
          quotationLinks,
        };
      },
    );
  }

  async importCopy(input: string) {
    const data = decodeProjectFile(input);
    const { db } = this;
    const projectId = crypto.randomUUID();
    const sourceIds = new Map(
      data.sources.map(({ id }) => [id, crypto.randomUUID()]),
    );
    const codeIds = new Map(
      data.codes.map(({ id }) => [id, crypto.randomUUID()]),
    );
    const annotationIds = new Map(
      data.annotations.map(({ id }) => [id, crypto.randomUUID()]),
    );
    const typeIds = new Map(
      data.relationTypes.map(({ id }) => [id, crypto.randomUUID()]),
    );
    const directionById = new Map(
      data.relationTypes.map(({ id, direction }) => [id, direction]),
    );
    function remap(ids: Map<string, string>, id: string) {
      const mapped = ids.get(id);
      if (!mapped) throw new Error('Referencia inválida.');
      return mapped;
    }
    await db.transaction(
      'rw',
      [
        db.projects,
        db.sources,
        db.codes,
        db.annotations,
        db.codings,
        db.relationTypes,
        db.quotationLinks,
      ],
      async () => {
        await db.projects.add({ ...data.project, id: projectId });
        await db.sources.bulkAdd(
          data.sources.map((row) => ({
            ...row,
            projectId,
            id: remap(sourceIds, row.id),
          })),
        );
        await db.codes.bulkAdd(
          data.codes.map((row) => ({
            ...row,
            projectId,
            id: remap(codeIds, row.id),
            nameKey: codeNameKey(row.name),
          })),
        );
        await db.annotations.bulkAdd(
          data.annotations.map((row) => ({
            ...row,
            projectId,
            id: remap(annotationIds, row.id),
            sourceId: remap(sourceIds, row.sourceId),
            start: row.selectors.position.start,
            end: row.selectors.position.end,
          })),
        );
        await db.codings.bulkAdd(
          data.codings.map((row) => ({
            ...row,
            projectId,
            id: crypto.randomUUID(),
            annotationId: remap(annotationIds, row.annotationId),
            codeId: remap(codeIds, row.codeId),
          })),
        );
        await db.relationTypes.bulkAdd(
          data.relationTypes.map((row) => ({
            ...row,
            projectId,
            id: remap(typeIds, row.id),
            nameKey: codeNameKey(row.name),
          })),
        );
        await db.quotationLinks.bulkAdd(
          data.quotationLinks.map((row) => {
            const direction = directionById.get(row.relationTypeId);
            if (!direction) throw new Error('Tipo de relación inválido.');
            return {
              ...row,
              ...orderLinkEndpoints(
                direction,
                remap(annotationIds, row.fromAnnotationId),
                remap(annotationIds, row.toAnnotationId),
              ),
              id: crypto.randomUUID(),
              projectId,
              relationTypeId: remap(typeIds, row.relationTypeId),
            };
          }),
        );
      },
    );
    return projectId;
  }
}
