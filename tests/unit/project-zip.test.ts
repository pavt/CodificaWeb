import { expect, test } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { createProjectZip } from '../../src/domain/project-zip';

test('Q19: genera archivos independientes y rutas seguras para documentos con nombres iguales', () => {
  const input = {
    ...fixture,
    project: { ...fixture.project, name: '../Caso de análisis' },
    sources: [
      ...fixture.sources,
      {
        ...fixture.sources[0],
        id: '00000000-0000-4000-8000-0000000000aa',
        url: 'https://example.test/',
      },
    ],
  };
  const { filename, bytes } = createProjectZip(JSON.stringify(input));
  expect(filename).toBe('Caso-de-analisis.zip');
  const entries = unzipSync(bytes);
  const read = (path: string) => {
    const bytes = entries[`Caso-de-analisis/${path}`];
    if (!bytes) throw new Error(path);
    return JSON.parse(strFromU8(bytes));
  };
  const index = read('proyecto.json');
  expect(index.documents).toHaveLength(2);
  expect(read(index.documents[0].path).citations).toMatchObject([
    { note: fixture.annotations[0]?.note, categories: [{}, {}] },
  ]);
  expect(read(index.documents[1].path).citations).toEqual([]);
});
