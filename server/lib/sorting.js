/**
 * Sorting algorithms — implemented from scratch for the project.
 *
 * - mergeSort: stable, guaranteed O(n log n), returns a new array.
 *   Used for: product table sorting, best-seller ranking, alert ordering.
 * - quickSort: in-place, O(n log n) average / O(n^2) worst case.
 *   Median-of-three pivot selection avoids the classic worst case on
 *   already-sorted input. Used for: transaction logs (newest first).
 * - topN: keeps the best n items in O(n log k) using a bounded min-heap.
 *   Used for: dashboard best sellers.
 */
import { MinHeap } from './minHeap.js';

export function defaultCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Stable merge sort. O(n log n) time, O(n) extra space. */
export function mergeSort(items, compare = defaultCompare) {
  if (items.length <= 1) return items.slice();
  const mid = items.length >> 1;
  return merge(
    mergeSort(items.slice(0, mid), compare),
    mergeSort(items.slice(mid), compare),
    compare,
  );
}

function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // <= keeps the sort stable (equal items keep their original order).
    if (compare(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/** In-place quick sort with median-of-three pivot. Returns the same array. */
export function quickSort(items, compare = defaultCompare) {
  quickSortRange(items, 0, items.length - 1, compare);
  return items;
}

function quickSortRange(arr, lo, hi, compare) {
  if (lo >= hi) return;
  const pivotIndex = partition(arr, lo, hi, compare);
  quickSortRange(arr, lo, pivotIndex - 1, compare);
  quickSortRange(arr, pivotIndex + 1, hi, compare);
}

function partition(arr, lo, hi, compare) {
  const mid = (lo + hi) >> 1;
  // Order arr[lo] <= arr[mid] <= arr[hi], then move the median next to hi.
  if (compare(arr[mid], arr[lo]) < 0) swap(arr, mid, lo);
  if (compare(arr[hi], arr[lo]) < 0) swap(arr, hi, lo);
  if (compare(arr[hi], arr[mid]) < 0) swap(arr, hi, mid);
  swap(arr, mid, hi);
  const pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (compare(arr[j], pivot) <= 0) {
      swap(arr, i, j);
      i++;
    }
  }
  swap(arr, i, hi);
  return i;
}

function swap(arr, a, b) {
  const tmp = arr[a];
  arr[a] = arr[b];
  arr[b] = tmp;
}

/**
 * Return the n best items by score, using a bounded min-heap.
 *
 * The heap is keyed so its root is the WORST item currently kept; when the
 * heap grows past n, the worst is popped. That leaves the n best items in
 * O(n log k) time and O(k) space — better than a full O(n log n) sort when
 * k is small (e.g., "top 5 best sellers out of 60 products").
 */
export function topN(items, n, scoreOf, betterThan = (a, b) => a > b) {
  if (n <= 0 || items.length === 0) return [];
  const heap = new MinHeap((a, b) => {
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    if (sa === sb) return 0;
    return betterThan(sb, sa) ? -1 : 1;
  });
  for (const item of items) {
    heap.push(item);
    if (heap.size > n) heap.pop();
  }
  return heap.toArray();
}
