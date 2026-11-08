import { codeNameKey } from '../domain/codings';
import { decodeProjectFile } from '../domain/project-file';
import type { CodingDatabase } from './database';

export class ProjectTransfer {
  constructor(private readonly db: CodingDatabase) {}

  exportProject(id: string) {
    const { db } = this;
    return db.transaction(
      'r',
      [db.projects, db.sources, db.codes, db.annotations, db.codings],
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
        return {
          schemaVersion: 1 as const,
          exportedAt: new Date().toISOString(),
          project,
          sources,
          codes,
          annotations,
          codings,
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
    function remap(ids: Map<string, string>, id: string) {
      const mapped = ids.get(id);
      if (!mapped) throw new Error('Referencia inválida.');
      return mapped;
    }
    await db.transaction(
      'rw',
      [db.projects, db.sources, db.codes, db.annotations, db.codings],
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
      },
    );
    return projectId;
  }
}
