/**
 * DoublyLinkedList — a linked list whose nodes hold { prev, next } links.
 *
 * Used for: the active cart. Paired with a hash table (code -> node), the
 * cart supports:
 *   - append at the tail: O(1)
 *   - remove any line given its node: O(1), no array shifting
 *   - find a duplicate scan by code: O(1) through the paired hash table
 *   - update a line's quantity in place: O(1)
 */
export class DoublyLinkedListNode {
  constructor(value) {
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

export class DoublyLinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  /** Add a node at the tail. O(1). Returns the new node. */
  append(value) {
    const node = new DoublyLinkedListNode(value);
    if (this.tail === null) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.length++;
    return node;
  }

  /** Insert a node right before `node`. O(1). Returns the new node. */
  insertBefore(node, value) {
    const newNode = new DoublyLinkedListNode(value);
    newNode.next = node;
    newNode.prev = node.prev;
    if (node.prev) node.prev.next = newNode;
    else this.head = newNode;
    node.prev = newNode;
    this.length++;
    return newNode;
  }

  /** Insert a node right after `node`. O(1). Returns the new node. */
  insertAfter(node, value) {
    const newNode = new DoublyLinkedListNode(value);
    newNode.prev = node;
    newNode.next = node.next;
    if (node.next) node.next.prev = newNode;
    else this.tail = newNode;
    node.next = newNode;
    this.length++;
    return newNode;
  }

  /** Unlink a node from the list. O(1) because we hold the node reference. */
  remove(node) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
    this.length--;
    return node.value;
  }

  /** Linear search — O(n). Kept for completeness; the cart never needs it. */
  find(predicate) {
    for (let node = this.head; node !== null; node = node.next) {
      if (predicate(node.value)) return node;
    }
    return null;
  }

  /** Values in order, head to tail. O(n). */
  toArray() {
    const out = [];
    for (let node = this.head; node !== null; node = node.next) out.push(node.value);
    return out;
  }

  clear() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }
}
