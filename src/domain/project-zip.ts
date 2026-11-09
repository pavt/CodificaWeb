import { strToU8, zipSync } from 'fflate';
import { decodeProjectFile } from './project-file';

function fileStem(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function createProjectZip(json: string) {
  const snapshot = decodeProjectFile(json);
  const folder = fileStem(snapshot.project.name) || 'Proyecto';
  const files: Record<string, Uint8Array> = {};
  const write = (path: string, data: unknown) => {
    files[`${folder}/${path}`] = strToU8(JSON.stringify(data, null, 2));
  };
  const categories = new Map(snapshot.codes.map((code) => [code.id, code]));
  const assignments = new Map<string, typeof snapshot.codes>();
  for (const coding of snapshot.codings) {
    const category = categories.get(coding.codeId);
    if (!category) continue;
    const group = assignments.get(coding.annotationId) ?? [];
    group.push(category);
    assignments.set(coding.annotationId, group);
  }
  const citations = new Map<string, typeof snapshot.annotations>();
  for (const citation of snapshot.annotations) {
    const group = citations.get(citation.sourceId) ?? [];
    group.push(citation);
    citations.set(citation.sourceId, group);
  }
  const documents = snapshot.sources.map((source) => {
    const stem =
      fileStem(
        new URL(source.url).pathname
          .split('/')
          .filter(Boolean)
          .slice(-2)
          .join('-'),
      ) || 'pagina';
    const path = `documentos/${stem}--${source.id}.json`;
    write(path, {
      schemaVersion: 1,
      document: { ...source, format: 'web' },
      citations: (citations.get(source.id) ?? []).map((citation) => ({
        ...citation,
        text: citation.selectors.quote.exact,
        categories: assignments.get(citation.id) ?? [],
      })),
    });
    return { id: source.id, title: source.title, url: source.url, path };
  });
  write('proyecto.json', {
    schemaVersion: 1,
    exportedAt: snapshot.exportedAt,
    project: snapshot.project,
    documents,
    categories: snapshot.codes,
    relationTypes: snapshot.relationTypes,
    quotationLinks: snapshot.quotationLinks,
  });
  return { filename: `${folder}.zip`, bytes: zipSync(files) };
}
