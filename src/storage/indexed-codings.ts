import { fragmentKey } from '../domain/codings';
import type {
  CodeAssignment,
  Fragment,
  HighlightEntry,
  HighlightCategory,
} from '../domain/codings';
import type { CodingDatabase } from './database';
import { IndexedCatalog, type CodeFields } from './indexed-catalog';
import { IndexedProjects } from './indexed-projects';

export class IndexedCodings {
  constructor(private readonly db: CodingDatabase) {}

  private findSource(projectId: string, url: string) {
    return this.db.sources.get({ '[projectId+url]': [projectId, url] });
  }

  private findAnnotation(sourceId: string, fragment: Fragment) {
    const { start, end } = fragment.selectors.position;
    const key = fragmentKey(fragment);
    return this.db.annotations
      .where('[sourceId+start+end]')
      .equals([sourceId, start, end])
      .and(
        (row) =>
          fragmentKey({ url: fragment.url, selectors: row.selectors }) === key,
      )
      .first();
  }

  async citationId(projectId: string, fragment: Fragment) {
    const source = await this.findSource(projectId, fragment.url);
    return source
      ? ((await this.findAnnotation(source.id, fragment))?.id ?? null)
      : null;
  }

  private async readCurrent(
    projectId: string,
    fragment: Fragment,
  ): Promise<CodeAssignment[]> {
    const source = await this.findSource(projectId, fragment.url);
    const annotation =
      source && (await this.findAnnotation(source.id, fragment));
    const associations = annotation
      ? await this.db.codings
          .where('[projectId+annotationId]')
          .equals([projectId, annotation.id])
          .toArray()
      : [];
    const assigned = new Set(associations.map((row) => row.codeId));
    const catalog = await this.db.codes
      .where('projectId')
      .equals(projectId)
      .sortBy('id');
    return catalog.map(({ id, name, color, description }) => ({
      id,
      name,
      color,
      description,
      projectId,
      assigned: assigned.has(id),
    }));
  }

  read(projectId: string, fragment: Fragment) {
    return this.db.transaction(
      'r',
      [this.db.sources, this.db.annotations, this.db.codings, this.db.codes],
      () => this.readCurrent(projectId, fragment),
    );
  }

  highlights(
    projectId: string,
    url: string,
    filter: string | null,
  ): Promise<HighlightEntry[]> {
    return this.db.transaction(
      'r',
      [this.db.sources, this.db.annotations, this.db.codings, this.db.codes],
      async () => {
        const source = await this.findSource(projectId, url);
        if (!source) return [];
        const annotations = await this.db.annotations
          .where('[projectId+sourceId]')
          .equals([projectId, source.id])
          .toArray();
        const associations = await this.db.codings
          .where('annotationId')
          .anyOf(annotations.map((entry) => entry.id))
          .toArray();
        const catalog = new Map(
          (
            await this.db.codes.where('projectId').equals(projectId).toArray()
          ).map(({ id, name, color, description }) => [
            id,
            { id, name, color, description },
          ]),
        );
        const byAnnotation = new Map<string, HighlightCategory[]>();
        for (const { projectId: owner, annotationId, codeId } of associations) {
          const category = catalog.get(codeId);
          if (owner !== projectId || !category) continue;
          const categories = byAnnotation.get(annotationId) ?? [];
          categories.push(category);
          byAnnotation.set(annotationId, categories);
        }
        return annotations.flatMap(({ id, selectors }) => {
          const categories = byAnnotation.get(id);
          if (!categories?.length) return [];
          categories.sort((a, b) => (a.id < b.id ? -1 : Number(a.id !== b.id)));
          const selected =
            filter === null
              ? categories[0]
              : categories.find(({ id }) => id === filter);
          return selected
            ? [{ id, selectors, color: selected.color, categories }]
            : [];
        });
      },
    );
  }

  private async findOrCreateAnnotation(
    projectId: string,
    fragment: Fragment,
    create: boolean,
    time: string,
  ) {
    let source = await this.findSource(projectId, fragment.url);
    if (!source && create) {
      source = {
        id: crypto.randomUUID(),
        projectId,
        url: fragment.url,
        title: fragment.url,
        capturedAt: time,
        createdAt: time,
        updatedAt: time,
      };
      await this.db.sources.add(source);
    }
    if (source) {
      let annotation = await this.findAnnotation(source.id, fragment);
      if (!annotation && create) {
        const { start, end } = fragment.selectors.position;
        annotation = {
          id: crypto.randomUUID(),
          projectId,
          sourceId: source.id,
          start,
          end,
          selectors: fragment.selectors,
          createdAt: time,
          updatedAt: time,
        };
        await this.db.annotations.add(annotation);
      }
      return annotation;
    }
  }

  private async currentNote(projectId: string, fragment: Fragment) {
    const source = await this.findSource(projectId, fragment.url);
    return source
      ? ((await this.findAnnotation(source.id, fragment))?.note ?? null)
      : null;
  }

  readNote(projectId: string, fragment: Fragment) {
    return this.db.transaction(
      'r',
      [this.db.sources, this.db.annotations],
      () => this.currentNote(projectId, fragment),
    );
  }

  setNote(
    projectId: string,
    fragment: Fragment,
    note: string | null,
    operationId: string,
  ) {
    const fingerprint = JSON.stringify([
      'note',
      projectId,
      fragmentKey(fragment),
      note,
    ]);
    return this.db.transaction(
      'rw',
      [
        this.db.projects,
        this.db.sources,
        this.db.annotations,
        this.db.operations,
      ],
      async () => {
        const receipt = await this.db.operations.get(operationId);
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            throw new Error('Operación reutilizada con otros datos.');
          return this.currentNote(projectId, fragment);
        }
        if (!(await this.db.projects.get(projectId)))
          throw new Error('Proyecto inexistente.');
        const time = new Date().toISOString();
        const annotation = await this.findOrCreateAnnotation(
          projectId,
          fragment,
          note !== null,
          time,
        );
        if (annotation && (annotation.note ?? null) !== note) {
          if (note === null) delete annotation.note;
          else annotation.note = note;
          annotation.updatedAt = time;
          await this.db.annotations.put(annotation);
        }
        await this.db.operations.add({
          id: operationId,
          fingerprint,
          projectId,
        });
        return note;
      },
    );
  }

  private async writeAssignment(
    projectId: string,
    fragment: Fragment,
    codeId: string,
    assigned: boolean,
  ) {
    const time = new Date().toISOString();
    const annotation = await this.findOrCreateAnnotation(
      projectId,
      fragment,
      assigned,
      time,
    );
    if (annotation) {
      const existing = await this.db.codings.get({
        '[annotationId+codeId]': [annotation.id, codeId],
      });
      if (assigned && !existing) {
        await this.db.codings.add({
          id: crypto.randomUUID(),
          projectId,
          annotationId: annotation.id,
          codeId,
          createdAt: time,
          updatedAt: time,
        });
      } else if (!assigned && existing) {
        await this.db.codings.delete(existing.id);
      }
    }
  }

  createAndApply(
    projectId: string,
    fragment: Fragment,
    fields: CodeFields,
    operationId: string,
  ) {
    const fingerprint = JSON.stringify([
      'create-and-apply',
      projectId,
      fragmentKey(fragment),
      fields.name,
      fields.description,
    ]);
    return this.db.transaction('rw', this.db.tables, async () => {
      if ((await new IndexedProjects(this.db).activeId()) !== projectId)
        throw new Error('Proyecto inactivo.');
      const receipt = await this.db.operations.get(operationId);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new Error('Operación reutilizada con otros datos.');
      } else {
        const codeId = await new IndexedCatalog(this.db).create(
          projectId,
          fields,
        );
        await this.writeAssignment(projectId, fragment, codeId, true);
        await this.db.operations.add({
          id: operationId,
          fingerprint,
          projectId,
        });
      }
      return this.readCurrent(projectId, fragment);
    });
  }

  set(
    projectId: string,
    fragment: Fragment,
    codeId: string,
    assigned: boolean,
    operationId: string,
  ) {
    const fingerprint = JSON.stringify([
      projectId,
      fragmentKey(fragment),
      codeId,
      assigned,
    ]);
    return this.db.transaction('rw', this.db.tables, async () => {
      const receipt = await this.db.operations.get(operationId);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new Error('Operación reutilizada con otros datos.');
        return this.readCurrent(projectId, fragment);
      }
      const project = await this.db.projects.get(projectId);
      const code = await this.db.codes.get(codeId);
      if (!project || code?.projectId !== projectId)
        throw new Error('Código fuera del proyecto.');

      await this.writeAssignment(projectId, fragment, codeId, assigned);
      await this.db.operations.add({ id: operationId, fingerprint, projectId });
      return this.readCurrent(projectId, fragment);
    });
  }
}
