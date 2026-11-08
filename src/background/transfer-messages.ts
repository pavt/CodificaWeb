import {
  maxProjectBytes,
  maxProjectRecords,
} from '../domain/project-file-limits';
import { ProjectTransfer } from '../storage/project-transfer';
import { database, projects } from './coding-messages';

const transfer = new ProjectTransfer(database);

export async function handleTransferRequest(message: Record<string, unknown>) {
  if (message.type === 'transfer.export') {
    if (
      typeof message.projectId !== 'string' ||
      message.projectId !== (await projects.activeId())
    ) {
      return { kind: 'error' };
    }
    const snapshot = await transfer.exportProject(message.projectId);
    const { sources, codes, annotations, codings } = snapshot;
    if (
      1 + sources.length + codes.length + annotations.length + codings.length >
      maxProjectRecords
    )
      return { kind: 'error' };
    const json = JSON.stringify(snapshot, null, 2);
    if (new TextEncoder().encode(json).length > maxProjectBytes)
      return { kind: 'error' };
    return { kind: 'exported', json };
  }

  if (message.type !== 'transfer.import' || typeof message.json !== 'string')
    return { kind: 'error' };
  try {
    const id = await transfer.importCopy(message.json);
    void chrome.runtime
      .sendMessage({ type: 'project.changed' })
      .catch(() => undefined);
    return { kind: 'imported', id };
  } catch {
    return { kind: 'error' };
  }
}
