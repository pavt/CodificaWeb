import type { Fragment } from '../../src/domain/codings';
import type { CodingDatabase } from '../../src/storage/database';

export async function seedHistoricalNote(
  db: CodingDatabase,
  projectId: string,
  fragment: Fragment,
  note: string,
) {
  const { url, selectors } = fragment;
  const { start, end } = selectors.position;
  const time = new Date().toISOString();
  const source = await db.sources.get({ '[projectId+url]': [projectId, url] });
  const sourceId = source?.id ?? crypto.randomUUID();
  if (!source) {
    await db.sources.add({
      id: sourceId,
      projectId,
      url,
      title: url,
      capturedAt: time,
      createdAt: time,
      updatedAt: time,
    });
  }
  const annotation = await db.annotations.get({
    '[sourceId+start+end]': [sourceId, start, end],
  });
  await db.annotations.put({
    id: annotation?.id ?? crypto.randomUUID(),
    projectId,
    sourceId,
    start,
    end,
    selectors,
    note,
    createdAt: annotation?.createdAt ?? time,
    updatedAt: time,
  });
}
