import type { CodingDatabase } from './database';

const activeKey = 'activeProject';

export class IndexedProjects {
  constructor(private readonly db: CodingDatabase) {}

  async activeId() {
    const preference = await this.db.preferences.get(activeKey);
    if (preference && (await this.db.projects.get(preference.value)))
      return preference.value;
    return (await this.db.projects.orderBy('id').first())?.id ?? null;
  }

  list() {
    return this.db.transaction(
      'r',
      [this.db.projects, this.db.preferences],
      async () => ({
        activeId: await this.activeId(),
        projects: await this.db.projects.orderBy('id').toArray(),
      }),
    );
  }

  async create(name: string, description: string) {
    const id = crypto.randomUUID();
    const time = new Date().toISOString();
    await this.db.projects.add({
      id,
      name,
      description,
      createdAt: time,
      updatedAt: time,
    });
    return id;
  }

  async update(id: string, name: string, description: string) {
    if (
      !(await this.db.projects.update(id, {
        name,
        description,
        updatedAt: new Date().toISOString(),
      }))
    ) {
      throw new Error('Proyecto inexistente.');
    }
  }

  select(id: string) {
    return this.db.transaction(
      'rw',
      [this.db.projects, this.db.preferences],
      async () => {
        if (!(await this.db.projects.get(id)))
          throw new Error('Proyecto inexistente.');
        await this.db.preferences.put({ key: activeKey, value: id });
      },
    );
  }

  remove(id: string) {
    return this.db.transaction('rw', this.db.tables, async () => {
      await this.db.quotationLinks.where('projectId').equals(id).delete();
      await this.db.relationTypes.where('projectId').equals(id).delete();
      const ids = await this.db.annotations
        .where('projectId')
        .equals(id)
        .primaryKeys();
      await this.db.codings.where('annotationId').anyOf(ids).delete();
      await this.db.annotations.where('projectId').equals(id).delete();
      await this.db.sources.where('projectId').equals(id).delete();
      await this.db.codes.where('projectId').equals(id).delete();
      await this.db.operations.where('projectId').equals(id).delete();
      await this.db.projects.delete(id);
      if ((await this.db.preferences.get(activeKey))?.value === id) {
        await this.db.preferences.delete(activeKey);
      }
    });
  }
}
