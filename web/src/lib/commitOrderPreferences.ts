// Per-device preference: the order the Pull Requests view lists a PR's commits in.
// Newest first by default.

import { useSyncExternalStore } from "react";

export type CommitOrder = "newest" | "oldest";

const STORAGE_KEY = "omnigent:pr-commit-order";
const listeners = new Set<() => void>();

export function readCommitOrder(): CommitOrder {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "oldest" ? "oldest" : "newest";
  } catch {
    return "newest";
  }
}

export function writeCommitOrder(value: CommitOrder): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage quota or access errors shouldn't break the app.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stored order, shared by every commit list on the page. */
export function useCommitOrder(): [CommitOrder, (value: CommitOrder) => void] {
  const order = useSyncExternalStore(subscribe, readCommitOrder, () => "newest" as const);
  return [order, writeCommitOrder];
}

/** Commits in `order`, given a list that is oldest first. */
export function orderCommits<T>(commits: readonly T[], order: CommitOrder): T[] {
  return order === "newest" ? [...commits].reverse() : [...commits];
}
