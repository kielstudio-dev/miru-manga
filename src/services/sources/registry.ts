import { ISource } from './types';
import { sampleSource } from './sampleSource';
import { localSource } from './localSource';

class SourceRegistry {
  private sources: Map<string, ISource> = new Map();

  constructor() {
    this.register(sampleSource);
    this.register(localSource);
  }

  register(source: ISource): void {
    this.sources.set(source.id, source);
  }

  unregister(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  get(sourceId: string): ISource | undefined {
    return this.sources.get(sourceId);
  }

  has(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  getAll(): ISource[] {
    return Array.from(this.sources.values());
  }

  getLocalSource(): ISource {
    return localSource;
  }
}

export const sourceRegistry = new SourceRegistry();
