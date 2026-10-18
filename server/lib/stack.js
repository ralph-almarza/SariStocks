/**
 * Stack — LIFO collection backed by an array.
 *
 * Used for: the cart's undo stack and redo stack. push, pop, and peek are
 * all O(1) because array push/pop operate at the end.
 */
export class Stack {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    return this;
  }

  pop() {
    return this.items.pop();
  }

  peek() {
    return this.items[this.items.length - 1];
  }

  get size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  clear() {
    this.items.length = 0;
  }
}
