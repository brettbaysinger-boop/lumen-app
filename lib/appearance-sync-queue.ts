export class AppearanceSyncQueue<T> {
  private latest: T | null = null;
  private revision = 0;
  private savedRevision = 0;
  private activeFlush: Promise<boolean> | null = null;
  private generation = 0;

  constructor(
    private readonly save: (value: T) => Promise<void>
  ) {}

  enqueue(value: T): void {
    this.latest = value;
    this.revision += 1;
  }

  get pending(): boolean {
    return this.revision > this.savedRevision;
  }

  cancel(): void {
    this.generation += 1;
    this.latest = null;
    this.savedRevision = this.revision;
  }

  flush(): Promise<boolean> {
    if (this.activeFlush) return this.activeFlush;

    const operation = this.performFlush();
    this.activeFlush = operation;

    void operation.finally(() => {
      if (this.activeFlush === operation) {
        this.activeFlush = null;
      }
    });

    return operation;
  }

  private async performFlush(): Promise<boolean> {
    const generation = this.generation;

    while (this.pending && generation === this.generation) {
        const snapshot = this.latest;
        const revision = this.revision;

        if (snapshot === null) break;

        try {
          await this.save(snapshot);
        } catch {
          return false;
        }

        if (generation !== this.generation) {
          return false;
        }

        this.savedRevision = revision;
      }

    return !this.pending;
  }
}
