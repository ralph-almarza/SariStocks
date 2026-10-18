/**
 * HashTable — a string-keyed hash table with separate chaining.
 *
 * Used for: product lookup by barcode/QR code, user lookup by username,
 * and the cart's code -> node index. Average-case get/set/delete are O(1);
 * worst case is O(n) when every key collides into one bucket.
 *
 * The hash function is FNV-1a (32-bit), chosen because it is short,
 * fast, and distributes string keys well.
 */
export class HashTable {
  constructor(initialCapacity = 16, maxLoadFactor = 0.75) {
    this.capacity = Math.max(4, initialCapacity);
    this.maxLoadFactor = maxLoadFactor;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.count = 0;
  }

  /** Map a string key to a bucket index. O(key length). */
  hash(key) {
    const k = String(key);
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV prime
    }
    return (h >>> 0) % this.capacity;
  }

  /** Insert or update. O(1) average. */
  set(key, value) {
    const bucket = this.buckets[this.hash(key)];
    for (const pair of bucket) {
      if (pair[0] === key) {
        pair[1] = value; // update existing
        return this;
      }
    }
    bucket.push([key, value]);
    this.count++;
    if (this.count / this.capacity > this.maxLoadFactor) {
      this.#resize(this.capacity * 2);
    }
    return this;
  }

  /** Retrieve a value. Returns undefined when the key is absent. O(1) average. */
  get(key) {
    for (const pair of this.buckets[this.hash(key)]) {
      if (pair[0] === key) return pair[1];
    }
    return undefined;
  }

  /** Membership test. O(1) average. */
  has(key) {
    for (const pair of this.buckets[this.hash(key)]) {
      if (pair[0] === key) return true;
    }
    return false;
  }

  /** Remove a key. Returns true when something was removed. O(1) average. */
  delete(key) {
    const bucket = this.buckets[this.hash(key)];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i][0] === key) {
        bucket.splice(i, 1);
        this.count--;
        return true;
      }
    }
    return false;
  }

  keys() {
    return this.buckets.flat().map((pair) => pair[0]);
  }

  values() {
    return this.buckets.flat().map((pair) => pair[1]);
  }

  entries() {
    return this.buckets.flat().map((pair) => [pair[0], pair[1]]);
  }

  clear() {
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.count = 0;
  }

  get size() {
    return this.count;
  }

  /** Double the bucket count and rehash every entry. O(n). */
  #resize(newCapacity) {
    const entries = this.entries();
    this.capacity = newCapacity;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.count = 0;
    for (const [key, value] of entries) this.set(key, value);
  }
}
