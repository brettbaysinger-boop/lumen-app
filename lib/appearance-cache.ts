export type CacheRecord<T> = {
  preferences: T;
  pending: boolean;
  revision: number;
};

export type CacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export class AppearanceCache<T> {
  private writes = new Map<string, Promise<void>>();
  private revisions = new Map<string, number>();
  private records = new Map<string, CacheRecord<T>>();

  constructor(
    private readonly storage: CacheStorage,
    private readonly prefix = 'lumen-account-appearance-v1-'
  ) {}

  private key(userId: string): string {
    return `${this.prefix}${userId}`;
  }

  async load(
    userId: string,
    parse: (value: unknown) => T
  ): Promise<CacheRecord<T> | null> {
    const key = this.key(userId);

    await (this.writes.get(key) ?? Promise.resolve());

    const existing = this.records.get(key);
    if (existing) return existing;

    const raw = await this.storage.getItem(key);

    // An edit may have arrived while storage was being read.
    // Never replace a newer in-memory record with an older disk value.
    const newer = this.records.get(key);
    if (newer) return newer;

    if (!raw) return null;

    try {
      const value: unknown = JSON.parse(raw);

      if (!value || typeof value !== 'object') return null;

      const object = value as Record<string, unknown>;

      const record: CacheRecord<T> = 'preferences' in object
        ? {
            preferences: parse(object.preferences),
            pending: object.pending === true,
            revision: typeof object.revision === 'number' &&
              Number.isSafeInteger(object.revision) &&
              object.revision >= 0
                ? object.revision
                : 0,
          }
        : {
            preferences: parse(value),
            pending: false,
            revision: 0,
          };

      this.records.set(key, record);
      this.revisions.set(key, record.revision);
      return record;
    } catch {
      return null;
    }
  }

  async update(userId: string, preferences: T): Promise<number> {
    const key = this.key(userId);
    const revision = (this.revisions.get(key) ?? 0) + 1;

    this.revisions.set(key, revision);

    const record: CacheRecord<T> = {
      preferences,
      pending: true,
      revision,
    };

    this.records.set(key, record);
    await this.persist(key, record);

    return revision;
  }

  async acknowledge(userId: string, revision: number): Promise<boolean> {
    const key = this.key(userId);
    const current = this.records.get(key);

    if (!current || current.revision !== revision || !current.pending) {
      return false;
    }

    const acknowledged: CacheRecord<T> = {
      ...current,
      pending: false,
    };

    this.records.set(key, acknowledged);
    await this.persist(key, acknowledged);
    return true;
  }

  async acceptCloud(userId: string, preferences: T): Promise<boolean> {
    const key = this.key(userId);
    const current = this.records.get(key);

    if (current?.pending) return false;

    const revision = (this.revisions.get(key) ?? 0) + 1;

    this.revisions.set(key, revision);

    const record: CacheRecord<T> = {
      preferences,
      pending: false,
      revision,
    };

    this.records.set(key, record);
    await this.persist(key, record);
    return true;
  }

  current(userId: string): CacheRecord<T> | null {
    return this.records.get(this.key(userId)) ?? null;
  }

  private persist(key: string, record: CacheRecord<T>): Promise<void> {
    const previous = this.writes.get(key) ?? Promise.resolve();

    const operation = previous
      .catch(() => {})
      .then(() => this.storage.setItem(key, JSON.stringify(record)));

    this.writes.set(key, operation);

    void operation.finally(() => {
      if (this.writes.get(key) === operation) {
        this.writes.delete(key);
      }
    }).catch(() => {});

    return operation;
  }
}
