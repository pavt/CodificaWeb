import { decodeSelectors, isRecord } from '../capture-contract';

import { maxProjectBytes, maxProjectRecords } from './project-file-limits';
import { codeNameKey } from './codings';
import { orderLinkEndpoints, type RelationType } from './relations';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function invalid(): never {
  throw new Error('El archivo no cumple el formato de proyecto JSON v1 o v2.');
}

function record(value: unknown, keys: string) {
  const allowed = new Set(keys.split(' '));
  if (
    !isRecord(value) ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key))
  )
    invalid();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}

function text(value: unknown, limit: number, required = false): string {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    (required && !value.trim())
  )
    invalid();
  return value;
}

function id(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value)) invalid();
  return value.toLowerCase();
}

function date(value: unknown) {
  if (typeof value !== 'string' || !datePattern.test(value)) invalid();
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !==
      (value.includes('.') ? value : value.replace(/Z$/, '.000Z'))
  )
    invalid();
  return value;
}

function entity(value: Record<string, unknown>) {
  const createdAt = date(value.createdAt);
  const updatedAt = date(value.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) invalid();
  return { id: id(value.id), createdAt, updatedAt };
}

function owned(value: Record<string, unknown>, projectId: string) {
  if (id(value.projectId) !== projectId) invalid();
  return { ...entity(value), projectId };
}

function sourceUrl(value: unknown) {
  const address = text(value, 2048, true);
  if (!URL.canParse(address)) invalid();
  const url = new URL(address);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2048
  )
    invalid();
  return url.href;
}

function selector(value: unknown) {
  const raw = record(value, 'profile quote position');
  record(raw.quote, 'type exact prefix suffix');
  record(raw.position, 'type start end');
  const selectors = decodeSelectors(raw);
  if (!selectors) invalid();
  return selectors;
}

function unique<T>(rows: readonly T[], key: (row: T) => string) {
  const keys = new Set(rows.map(key));
  if (keys.size !== rows.length) invalid();
  return keys;
}

export function decodeProjectFile(input: string) {
  if (
    input.length > maxProjectBytes ||
    new TextEncoder().encode(input).length > maxProjectBytes
  ) {
    throw new Error('El archivo supera el límite de 10 MiB.');
  }
  const raw: unknown = JSON.parse(input);
  if (!isRecord(raw)) invalid();
  const { schemaVersion } = raw;
  if (schemaVersion !== 1 && schemaVersion !== 2)
    throw new Error('Versión de proyecto no admitida.');
  const keys =
    'schemaVersion exportedAt project sources codes annotations codings';
  const envelope = record(
    raw,
    schemaVersion === 2 ? keys + ' relationTypes quotationLinks' : keys,
  );
  const exportedAt = date(envelope.exportedAt);
  const projectRow = record(
    envelope.project,
    'id name description createdAt updatedAt',
  );
  const project = {
    ...entity(projectRow),
    name: text(projectRow.name, 256, true),
    description: text(projectRow.description, 16_384),
  };
  const sourceRows = list(envelope.sources);
  const codeRows = list(envelope.codes);
  const annotationRows = list(envelope.annotations);
  const codingRows = list(envelope.codings);
  const typeRows = schemaVersion === 2 ? list(envelope.relationTypes) : [];
  const linkRows = schemaVersion === 2 ? list(envelope.quotationLinks) : [];
  if (
    1 +
      sourceRows.length +
      codeRows.length +
      annotationRows.length +
      codingRows.length +
      typeRows.length +
      linkRows.length >
    maxProjectRecords
  )
    invalid();

  const sources = sourceRows.map((value) => {
    const row = record(
      value,
      'id projectId url title capturedAt createdAt updatedAt',
    );
    return {
      ...owned(row, project.id),
      url: sourceUrl(row.url),
      title: text(row.title, 2048),
      capturedAt: date(row.capturedAt),
    };
  });
  unique(sources, (row) => row.url);
  const sourceIds = unique(sources, (row) => row.id);

  const codes = codeRows.map((value) => {
    const row = record(
      value,
      'id projectId name description color createdAt updatedAt',
    );
    const color = text(row.color, 7);
    if (!/^#[0-9a-f]{6}$/i.test(color)) invalid();
    return {
      ...owned(row, project.id),
      name: text(row.name, 256, true),
      description: text(row.description, 16_384),
      color,
    };
  });
  unique(codes, (row) => codeNameKey(row.name));
  const codeIds = unique(codes, (row) => row.id);

  const annotations = annotationRows.map((value) => {
    const row = record(
      value,
      'id projectId sourceId selectors note createdAt updatedAt',
    );
    const sourceId = id(row.sourceId);
    if (!sourceIds.has(sourceId)) invalid();
    return {
      ...owned(row, project.id),
      sourceId,
      selectors: selector(row.selectors),
      ...('note' in row ? { note: text(row.note, 16_384) } : {}),
    };
  });
  const annotationIds = unique(annotations, (row) => row.id);

  const codings = codingRows.map((value) => {
    const row = record(
      value,
      'id projectId annotationId codeId createdAt updatedAt',
    );
    const annotationId = id(row.annotationId);
    const codeId = id(row.codeId);
    if (!annotationIds.has(annotationId) || !codeIds.has(codeId)) invalid();
    return { ...owned(row, project.id), annotationId, codeId };
  });
  unique(codings, (row) => row.id);
  unique(codings, (row) => `${row.annotationId}/${row.codeId}`);
  const relationTypes = typeRows.map<Omit<RelationType, 'nameKey'>>((value) => {
    const row = record(
      value,
      'id projectId name description direction createdAt updatedAt',
    );
    const { direction } = row;
    if (direction !== 'directed' && direction !== 'symmetric') invalid();
    return {
      ...owned(row, project.id),
      name: text(row.name, 256, true).trim().normalize('NFC'),
      direction,
      ...('description' in row
        ? { description: text(row.description, 16_384) }
        : {}),
    };
  });
  unique(relationTypes, (row) => row.id);
  unique(relationTypes, (row) => codeNameKey(row.name));
  const typeById = new Map(relationTypes.map((row) => [row.id, row]));
  const sourceByAnnotation = new Map(
    annotations.map((row) => [row.id, row.sourceId]),
  );
  const quotationLinks = linkRows.map((value) => {
    const row = record(
      value,
      'id projectId fromAnnotationId toAnnotationId relationTypeId note createdAt updatedAt',
    );
    const relationTypeId = id(row.relationTypeId);
    const from = id(row.fromAnnotationId);
    const to = id(row.toAnnotationId);
    const fromSource = sourceByAnnotation.get(from);
    const toSource = sourceByAnnotation.get(to);
    const type = typeById.get(relationTypeId);
    if (!type || !fromSource || !toSource || fromSource === toSource) invalid();
    return {
      ...owned(row, project.id),
      ...orderLinkEndpoints(type.direction, from, to),
      relationTypeId,
      ...('note' in row ? { note: text(row.note, 16_384) } : {}),
    };
  });
  unique(quotationLinks, (row) => row.id);
  unique(quotationLinks, (row) =>
    [row.fromAnnotationId, row.toAnnotationId, row.relationTypeId].join('/'),
  );
  return {
    schemaVersion,
    exportedAt,
    project,
    sources,
    codes,
    annotations,
    codings,
    relationTypes,
    quotationLinks,
  };
}
