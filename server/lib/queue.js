/**
 * Queue — FIFO collection.
 *
 * Used for: the receipt print queue (sales print in the exact order they
 * happen). enqueue is O(1); dequeue is O(1) amortized thanks to the moving
 * head pointer, which is periodically compacted to avoid unbounded growth.
 */
export class Queue {
  constructor() {
    this.items = [];
    this.head = 0; // index of the next item to dequeue
  }

  enqueue(item) {
    this.items.push(item);
    return this;
  }

  dequeue() {
    if (this.isEmpty()) return undefined;
    const value = this.items[this.head];
    this.items[this.head] = undefined; // release the reference
    this.head++;
    // Compact when at least half of the backing array is dead space.
    if (this.head >= 32 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return value;
  }

  peek() {
    return this.isEmpty() ? undefined : this.items[this.head];
  }

  get size() {
    return this.items.length - this.head;
  }

  isEmpty() {
    return this.size === 0;
  }

  clear() {
    this.items = [];
    this.head = 0;
  }

  /** Snapshot in FIFO order (front of the queue first). */
  toArray() {
    return this.items.slice(this.head);
  }
}
