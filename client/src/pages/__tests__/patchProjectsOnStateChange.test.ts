import { describe, it, expect } from "vitest";
import { patchProjectsOnStateChange } from "../GSD";
import type { GsdProject, ProjectStateChangeEvent } from "../../lib/types";

function fixture(name: string, overrides: Partial<GsdProject> = {}): GsdProject {
  return {
    name,
    root: `/path/${name}`,
    display_name: null,
    state: null,
    roadmap: null,
    requirements: null,
    version: null,
    liveUrl: null,
    velocity: 0,
    streak: 0,
    estimatedCompletion: null,
    tmuxActive: false,
    tmuxSession: null,
    contextTokens: null,
    sessionUpdatedAt: null,
    sessionState: "waiting",
    statusText: null,
    sessionCost: null,
    stateEnteredAt: null,
    currentTask: null,
    ...overrides,
  };
}

describe("patchProjectsOnStateChange", () => {
  it("patches the matching project in place and leaves siblings reference-equal", () => {
    const foo = fixture("foo", { sessionState: "waiting" });
    const bar = fixture("bar", { sessionState: "working" });
    const projects: GsdProject[] = [foo, bar];

    const evt: ProjectStateChangeEvent = {
      project: "foo",
      sessionState: "working",
      statusText: null,
      currentTask: "planning phase 14",
      stateEnteredAt: "2026-04-06T10:00:00Z",
    };

    const next = patchProjectsOnStateChange(projects, evt);

    expect(next).not.toBe(projects); // new array
    expect(next).toHaveLength(2);

    const nextFoo = next.find((p) => p.name === "foo")!;
    expect(nextFoo.sessionState).toBe("working");
    expect(nextFoo.currentTask).toBe("planning phase 14");
    expect(nextFoo.stateEnteredAt).toBe("2026-04-06T10:00:00Z");
    expect(nextFoo).not.toBe(foo); // patched row is a new object

    const nextBar = next.find((p) => p.name === "bar")!;
    expect(nextBar).toBe(bar); // untouched row is reference-equal
  });

  it("returns the original array reference-unchanged for an unknown project name", () => {
    const projects: GsdProject[] = [fixture("foo"), fixture("bar")];
    const evt: ProjectStateChangeEvent = {
      project: "ghost",
      sessionState: "working",
      statusText: null,
      currentTask: null,
      stateEnteredAt: "2026-04-06T10:00:00Z",
    };

    const next = patchProjectsOnStateChange(projects, evt);

    expect(next).toBe(projects); // reference-equal — no-op
  });
});
