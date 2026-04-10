import { describe, it, expect } from "vitest";
import type { GsdProject, SessionState } from "../../lib/types";

// ─── Filter logic extracted from GSD.tsx for unit testing ─────────────────────
// This mirrors the displayedProjects derivation in the GSD component

function filterProjects(
  projects: GsdProject[],
  activeFilter: SessionState | null
): GsdProject[] {
  if (activeFilter === null) {
    return projects.filter((p) => p.sessionState !== "archived");
  }
  return projects.filter((p) => p.sessionState === activeFilter);
}

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeProject(name: string, sessionState: SessionState): GsdProject {
  return {
    name,
    root: `/path/${name}`,
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
    sessionState,
    display_name: null,
    statusText: null,
    sessionCost: null,
    stateEnteredAt: null,
    currentTask: null,
  };
}

const ALL_PROJECTS: GsdProject[] = [
  makeProject("alpha", "working"),
  makeProject("beta", "waiting"),
  makeProject("gamma", "waiting"),
  makeProject("delta", "paused"),
  makeProject("epsilon", "archived"),
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GSD activeFilter logic", () => {
  it("defaults to showing only waiting projects when filter is 'waiting'", () => {
    const result = filterProjects(ALL_PROJECTS, "waiting");
    expect(result.map((p) => p.name)).toEqual(["beta", "gamma"]);
  });

  it("shows only working projects when filter is 'working'", () => {
    const result = filterProjects(ALL_PROJECTS, "working");
    expect(result.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("shows only paused projects when filter is 'paused'", () => {
    const result = filterProjects(ALL_PROJECTS, "paused");
    expect(result.map((p) => p.name)).toEqual(["delta"]);
  });

  it("shows only archived projects when filter is 'archived'", () => {
    const result = filterProjects(ALL_PROJECTS, "archived");
    expect(result.map((p) => p.name)).toEqual(["epsilon"]);
  });

  it("shows all non-archived projects when filter is null (Show All)", () => {
    const result = filterProjects(ALL_PROJECTS, null);
    expect(result.map((p) => p.name)).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(result.find((p) => p.name === "epsilon")).toBeUndefined();
  });

  it("returns empty array when no projects match the filter", () => {
    const noWorking = ALL_PROJECTS.filter((p) => p.sessionState !== "working");
    const result = filterProjects(noWorking, "working");
    expect(result).toHaveLength(0);
  });

  it("null filter excludes archived even when multiple archived exist", () => {
    const moreArchived: GsdProject[] = [
      ...ALL_PROJECTS,
      makeProject("zeta", "archived"),
    ];
    const result = filterProjects(moreArchived, null);
    expect(result.every((p) => p.sessionState !== "archived")).toBe(true);
  });
});
