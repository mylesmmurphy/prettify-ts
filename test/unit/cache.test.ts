import * as assert from "node:assert";
import { LRUCache } from "../../packages/typescript-plugin/src/type-tree/lru-cache";

describe("LRU Cache", () => {
  it("should store and retrieve values", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);

    assert.strictEqual(cache.get("a"), 1);
    assert.strictEqual(cache.get("b"), 2);
    assert.strictEqual(cache.get("c"), undefined);
  });

  it("should evict least recently used items when at capacity", () => {
    const cache = new LRUCache<string, number>(2);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // Should evict 'a'

    assert.strictEqual(cache.get("a"), undefined);
    assert.strictEqual(cache.get("b"), 2);
    assert.strictEqual(cache.get("c"), 3);
  });

  it("should update access time when getting items", () => {
    const cache = new LRUCache<string, number>(2);

    cache.set("a", 1);
    cache.set("b", 2);

    // Access 'a' to make it most recently used
    cache.get("a");

    cache.set("c", 3); // Should evict 'b', not 'a'

    assert.strictEqual(cache.get("a"), 1);
    assert.strictEqual(cache.get("b"), undefined);
    assert.strictEqual(cache.get("c"), 3);
  });

  it("should handle updating existing keys", () => {
    const cache = new LRUCache<string, number>(2);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10); // Update existing key

    assert.strictEqual(cache.get("a"), 10);
    assert.strictEqual(cache.size, 2);

    cache.set("c", 3); // Should evict 'b'

    assert.strictEqual(cache.get("a"), 10);
    assert.strictEqual(cache.get("b"), undefined);
    assert.strictEqual(cache.get("c"), 3);
  });

  it("should respect maximum size", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    assert.strictEqual(cache.size, 3);

    cache.set("d", 4);
    assert.strictEqual(cache.size, 3);
  });

  it("should handle edge cases with size 1", () => {
    const cache = new LRUCache<string, number>(1);

    cache.set("a", 1);
    assert.strictEqual(cache.get("a"), 1);

    cache.set("b", 2);
    assert.strictEqual(cache.get("a"), undefined);
    assert.strictEqual(cache.get("b"), 2);
  });

  it("should clear all items", () => {
    const cache = new LRUCache<string, number>(3);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    assert.strictEqual(cache.size, 3);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.get("a"), undefined);
  });

  it("should throw error for invalid maxSize values", () => {
    assert.throws(() => new LRUCache<string, number>(0), /maxSize must be a positive integer/);
    assert.throws(() => new LRUCache<string, number>(-1), /maxSize must be a positive integer/);
    assert.throws(() => new LRUCache<string, number>(1.5), /maxSize must be a positive integer/);
    assert.doesNotThrow(() => new LRUCache<string, number>(1));
    assert.doesNotThrow(() => new LRUCache<string, number>(256));
  });
});
