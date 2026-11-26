import { afterEach, describe, expect, it } from "vitest";
import { orderCommits, readCommitOrder, writeCommitOrder } from "./commitOrderPreferences";

describe("commitOrderPreferences", () => {
  afterEach(() => window.localStorage.clear());

  it("defaults to newest first and remembers the choice", () => {
    expect(readCommitOrder()).toBe("newest");
    writeCommitOrder("oldest");
    expect(readCommitOrder()).toBe("oldest");
    writeCommitOrder("newest");
    expect(readCommitOrder()).toBe("newest");
  });

  it("orders an oldest-first list without changing it", () => {
    const commits = ["a", "b", "c"];
    expect(orderCommits(commits, "newest")).toEqual(["c", "b", "a"]);
    expect(orderCommits(commits, "oldest")).toEqual(["a", "b", "c"]);
    expect(commits).toEqual(["a", "b", "c"]);
  });
});
