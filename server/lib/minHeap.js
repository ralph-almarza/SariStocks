/**
 * MinHeap — an array-based binary min-heap.
 *
 * Used for: low-stock alerts (most urgent first) and bounded top-N ranking
 * (best sellers). peek is O(1); push and pop are O(log n); building a heap
 * from an array with heapify is O(n).
 *
 * The heap is generic: a `compare(a, b)` returning a negative number means
 * `a` has higher priority and belongs closer to the root.
 */
export class MinHeap {
  constructor(compare = (a, b) => a - b) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  /** The highest-priority item. O(1). */
  peek() {
    return this.items[0];
  }

  /** Insert an item. O(log n). */
  push(item) {
    this.items.push(item);
    this.#bubbleUp(this.items.length - 1);
    return this;
  }

  /** Remove and return the highest-priority item. O(log n). */
  pop() {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.#bubbleDown(0);
    }
    return top;
  }

  /** Replace all contents and heapify in O(n) instead of n pushes of O(log n). */
  build(items) {
    this.items = items.slice();
    for (let i = (this.items.length >> 1) - 1; i >= 0; i--) this.#bubbleDown(i);
    return this;
  }

  toArray() {
    return this.items.slice();
  }

  #bubbleUp(index) {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.items[i], this.items[parent]) >= 0) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  #bubbleDown(index) {
    const n = this.items.length;
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}
