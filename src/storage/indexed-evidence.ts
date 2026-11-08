import { filterEvidence } from '../domain/evidence-search';
import type { EvidenceResult, SearchFilters } from '../domain/evidence-search';
import type { CodingDatabase } from './database';

export class IndexedEvidence {
  constructor(private readonly db: CodingDatabase) {}

  getFragment(projectId: string, id: string) {
    const { db } = this;
    return db.transaction('r', [db.annotations, db.sources], async () => {
      const annotation = await db.annotations.get(id);
      if (annotation?.projectId !== projectId) return undefined;
      const source = await db.sources.get(annotation.sourceId);
      return source?.projectId === projectId
        ? { url: source.url, selectors: annotation.selectors }
        : undefined;
    });
  }

  search(projectId: string, filters: SearchFilters) {
    const { db } = this;
    return db.transaction(
      'r',
      [db.sources, db.annotations, db.codes, db.codings],
      async () => {
        const sources = (
          await db.sources.where('projectId').equals(projectId).sortBy('url')
        ).map(({ id, url, title }) => ({ id, url, title }));
        const codes = (
          await db.codes.where('projectId').equals(projectId).sortBy('nameKey')
        ).map(({ id, name, color }) => ({ id, name, color }));
        const annotations = (
          await db.annotations
            .where('projectId')
            .equals(projectId)
            .sortBy('createdAt')
        ).reverse();
        const associations = await db.codings
          .where('annotationId')
          .anyOf(annotations.map(({ id }) => id))
          .toArray();
        const codeById = new Map(codes.map((code) => [code.id, code]));
        const sourceById = new Map(
          sources.map((source) => [source.id, source]),
        );
        const byAnnotation = new Map<string, typeof codes>();
        for (const association of associations) {
          const code = codeById.get(association.codeId);
          if (!code || association.projectId !== projectId) continue;
          const assigned = byAnnotation.get(association.annotationId) ?? [];
          assigned.push(code);
          byAnnotation.set(association.annotationId, assigned);
        }
        const rows: EvidenceResult[] = annotations.flatMap(
          ({ id, sourceId, selectors, note }) => {
            const source = sourceById.get(sourceId);
            return source
              ? [
                  {
                    id,
                    sourceId,
                    url: source.url,
                    quote: selectors.quote.exact,
                    ...(selectors.quote.exact.length < 80
                      ? {
                          context: {
                            prefix: selectors.quote.prefix,
                            suffix: selectors.quote.suffix,
                          },
                        }
                      : {}),
                    note: note ?? null,
                    codes: byAnnotation.get(id) ?? [],
                  },
                ]
              : [];
          },
        );
        return { sources, codes, results: filterEvidence(rows, filters) };
      },
    );
  }
}
