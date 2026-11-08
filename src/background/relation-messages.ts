import { isRecord } from '../capture-contract';
import type { RelationTypeFields } from '../domain/relations';
import { IndexedRelations } from '../storage/indexed-relations';
import { database, projects } from './coding-messages';

const relations = new IndexedRelations(database);
const error = { kind: 'error' } as const;
const panelPath = 'src/panel/index.html';

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function decodeType(value: unknown): RelationTypeFields | undefined {
  if (!isRecord(value)) return;
  const { name, direction, description = '' } = value;
  if (
    typeof name !== 'string' ||
    typeof description !== 'string' ||
    (direction !== 'directed' && direction !== 'symmetric')
  )
    return;
  return { name, direction, description };
}

export async function handleRelationRequest(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
) {
  const {
    projectId,
    type,
    id,
    fields,
    fromAnnotationId,
    toAnnotationId,
    relationTypeId,
    note = '',
  } = message;
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL(panelPath) ||
    !validId(projectId)
  )
    return error;
  try {
    return await database.transaction(
      'rw',
      [
        database.projects,
        database.preferences,
        database.relationTypes,
        database.quotationLinks,
        database.annotations,
        database.sources,
      ],
      async () => {
        if ((await projects.activeId()) !== projectId) return error;
        switch (type) {
          case 'relationTypes.list':
            return {
              kind: 'relationTypes' as const,
              types: await relations.listTypes(projectId),
            };
          case 'relationTypes.create':
          case 'relationTypes.update': {
            const values = decodeType(fields);
            if (!values) return error;
            if (type === 'relationTypes.create')
              return {
                kind: 'relationType' as const,
                value: await relations.createType(projectId, values),
              };
            if (!validId(id)) return error;
            await relations.updateType(projectId, id, values);
            return { kind: 'ok' as const };
          }
          case 'relationTypes.remove':
            if (!validId(id)) return error;
            await relations.removeType(projectId, id);
            return { kind: 'ok' as const };
          case 'relations.listBySource':
            if (!validId(id)) return error;
            return {
              kind: 'relatedSources' as const,
              sources: await relations.listBySource(projectId, id),
            };
          case 'relations.listByCitation':
            if (!validId(id)) return error;
            return {
              kind: 'relations' as const,
              links: await relations.listByCitation(projectId, id),
            };
          case 'relations.create':
          case 'relations.createWithType': {
            if (
              !validId(fromAnnotationId) ||
              !validId(toAnnotationId) ||
              typeof note !== 'string'
            )
              return error;
            const endpoints = { fromAnnotationId, toAnnotationId, note };
            if (type === 'relations.createWithType') {
              const values = decodeType(fields);
              if (!values) return error;
              return {
                kind: 'relation' as const,
                link: await relations.createWithType(
                  projectId,
                  endpoints,
                  values,
                ),
              };
            }
            if (!validId(relationTypeId)) return error;
            return {
              kind: 'relation' as const,
              link: await relations.createLink(projectId, {
                ...endpoints,
                relationTypeId,
              }),
            };
          }
          case 'relations.update':
            if (
              !validId(id) ||
              !validId(relationTypeId) ||
              typeof note !== 'string'
            )
              return error;
            return {
              kind: 'relation' as const,
              link: await relations.updateLink(projectId, id, {
                relationTypeId,
                note,
              }),
            };
          case 'relations.remove':
            if (!validId(id)) return error;
            await relations.removeLink(projectId, id);
            return { kind: 'ok' as const };
          default:
            return error;
        }
      },
    );
  } catch {
    return error;
  }
}
