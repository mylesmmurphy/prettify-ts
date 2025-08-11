/**
 * A generic Least Recently Used (LRU) cache implementation.
 * Maintains items in order of use, automatically evicting the least recently used
 * items when the cache reaches its maximum size.
 */
export class LRUCache<K, V> {
  private readonly maxSize: number;
  private readonly cache = new Map<K, V>();

  constructor(maxSize: number) {
    if (maxSize <= 0 || !Number.isInteger(maxSize)) {
      throw new Error("maxSize must be a positive integer");
    }
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }

    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}
