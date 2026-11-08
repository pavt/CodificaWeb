import { expect, test } from 'vitest';
import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { decodeProjectFile } from '../../src/domain/project-file';
import { maxProjectBytes } from '../../src/domain/project-file-limits';

test('Q10: el ejemplo v1 es válido y conserva los selectores y fechas', () => {
  expect(decodeProjectFile(JSON.stringify(fixture))).toEqual({
    ...fixture,
    relationTypes: [],
    quotationLinks: [],
  });
  expect(() =>
    decodeProjectFile(JSON.stringify({ ...fixture, schemaVersion: 3 })),
  ).toThrow('Versión');
  expect(() => decodeProjectFile('{')).toThrow();
});

test('Q13: limita el tamaño en bytes y rechaza estructuras y valores inesperados', () => {
  expect(() => decodeProjectFile('x'.repeat(maxProjectBytes + 1))).toThrow(
    '10 MiB',
  );
  expect(() => decodeProjectFile('á'.repeat(maxProjectBytes / 2 + 1))).toThrow(
    '10 MiB',
  );
  const [source] = fixture.sources;
  const [code] = fixture.codes;
  const [annotation] = fixture.annotations;
  const [coding] = fixture.codings;
  if (!source || !code || !annotation || !coding)
    throw new Error('Fixture incompleto');
  const cases: unknown[] = [
    null,
    [],
    { ...fixture, extra: true },
    { ...fixture, relationTypes: [], quotationLinks: [] },
    {
      ...fixture,
      schemaVersion: 2,
      relationTypes: Array.from({ length: 50_001 }, () => null),
      quotationLinks: [],
    },
    {
      ...fixture,
      schemaVersion: 2,
      relationTypes: [],
      quotationLinks: Array.from({ length: 50_001 }, () => null),
    },
    { ...fixture, exportedAt: '2026-02-30T00:00:00Z' },
    { ...fixture, project: { ...fixture.project, id: 'inválido' } },
    {
      ...fixture,
      project: { ...fixture.project, updatedAt: '2025-01-01T00:00:00Z' },
    },
    { ...fixture, project: { ...fixture.project, name: ' ' } },
    { ...fixture, sources: {} },
    { ...fixture, sources: Array.from({ length: 50_001 }, () => null) },
    { ...fixture, sources: [{ ...source, url: 'javascript:alert(1)' }] },
    { ...fixture, sources: [{ ...source, url: 'https://user@example.org/' }] },
    { ...fixture, sources: [{ ...source, url: 'sin-url' }] },
    { ...fixture, sources: [source, { ...source, id: crypto.randomUUID() }] },
    {
      ...fixture,
      sources: [source, { ...source, url: 'https://example.org/otra' }],
    },
    { ...fixture, sources: [{ ...source, projectId: crypto.randomUUID() }] },
    { ...fixture, codes: [{ ...code, color: 'red' }] },
    {
      ...fixture,
      codes: [
        code,
        { ...code, id: crypto.randomUUID(), name: ' ACCESIBILIDAD ' },
      ],
    },
    {
      ...fixture,
      annotations: [{ ...annotation, sourceId: crypto.randomUUID() }],
    },
    { ...fixture, annotations: [{ ...annotation, note: 'a'.repeat(16_385) }] },
    {
      ...fixture,
      annotations: [
        {
          ...annotation,
          selectors: {
            ...annotation.selectors,
            quote: { ...annotation.selectors.quote, extra: true },
          },
        },
      ],
    },
    {
      ...fixture,
      annotations: [
        {
          ...annotation,
          selectors: {
            ...annotation.selectors,
            position: { ...annotation.selectors.position, end: 99 },
          },
        },
      ],
    },
    { ...fixture, codings: [coding, { ...coding, id: crypto.randomUUID() }] },
    { ...fixture, codings: [{ ...coding, annotationId: crypto.randomUUID() }] },
  ];
  for (const value of cases)
    expect(() => decodeProjectFile(JSON.stringify(value))).toThrow();
});
