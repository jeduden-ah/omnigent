// Per-device preference: hide merged pull requests in the Pull Requests list.

const HIDE_MERGED_KEY = "omnigent:pull-request-list:hide-merged";

export function readHideMergedPullRequests(): boolean {
  try {
    return window.localStorage.getItem(HIDE_MERGED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeHideMergedPullRequests(value: boolean): void {
  try {
    window.localStorage.setItem(HIDE_MERGED_KEY, String(value));
  } catch {
    // Storage errors shouldn't break the panel.
  }
}
