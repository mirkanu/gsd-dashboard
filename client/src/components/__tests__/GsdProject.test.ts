import { describe, it, expect } from "vitest";
import type { GsdProject, GsdState } from "../../lib/types";

describe("GsdProject type shape", () => {
  it("should accept version as string", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: "v1",
      liveUrl: null,
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: false,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.version).toBe("v1");
  });

  it("should accept version as null", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: null,
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: false,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.version).toBeNull();
  });

  it("should accept liveUrl as string", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: "https://example.com",
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: false,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.liveUrl).toBe("https://example.com");
  });

  it("should accept liveUrl as null", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: null,
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: false,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.liveUrl).toBeNull();
  });

  it("should accept velocity, streak, and estimatedCompletion with non-zero values", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: null,
      velocity: 3,
      streak: 2,
      estimatedCompletion: "~2 days",
      tmuxActive: true,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.velocity).toBe(3);
    expect(project.streak).toBe(2);
    expect(project.estimatedCompletion).toBe("~2 days");
  });

  it("should accept tmuxActive as boolean", () => {
    const active: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: null,
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: true,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(active.tmuxActive).toBe(true);

    const inactive: GsdProject = { ...active, tmuxActive: false };
    expect(inactive.tmuxActive).toBe(false);
  });

  it("should accept velocity, streak, and estimatedCompletion as zero/null", () => {
    const project: GsdProject = {
      name: "test",
      root: "/path/to/test",
      state: null,
      roadmap: null,
      requirements: null,
      version: null,
      liveUrl: null,
      velocity: 0,
      streak: 0,
      estimatedCompletion: null,
      tmuxActive: false,
      contextTokens: null,
      sessionUpdatedAt: null,
      sessionState: "working",
    };
    expect(project.velocity).toBe(0);
    expect(project.streak).toBe(0);
    expect(project.estimatedCompletion).toBeNull();
  });
});

describe("tmuxActive terminal button contract", () => {
  const base: GsdProject = {
    name: "test",
    root: "/path",
    state: null,
    roadmap: null,
    requirements: null,
    version: null,
    liveUrl: null,
    velocity: 0,
    streak: 0,
    estimatedCompletion: null,
    tmuxActive: false,
    contextTokens: null,
    sessionUpdatedAt: null,
    sessionState: "working",
  };

  it("tmuxActive true enables terminal button", () => {
    const active: GsdProject = { ...base, tmuxActive: true };
    expect(active.tmuxActive).toBe(true);
  });

  it("tmuxActive false suppresses terminal button", () => {
    const inactive: GsdProject = { ...base, tmuxActive: false };
    expect(inactive.tmuxActive).toBe(false);
  });

  it("tmuxActive is a boolean discriminant (not nullable)", () => {
    const project: GsdProject = { ...base, tmuxActive: true };
    expect(typeof project.tmuxActive).toBe("boolean");
  });
});

describe("GsdState type shape", () => {
  it("should accept next_action as a string", () => {
    const state: GsdState = {
      milestone: null,
      milestone_name: null,
      status: "in-progress",
      current_phase: "08",
      last_activity: "2026-03-23 ran tests",
      next_action: "Run /gsd:plan-phase 8",
      progress: {
        percent: 50,
        completed_phases: 4,
        total_phases: 8,
        completed_plans: 10,
        total_plans: 20,
      },
      blockers: [],
    };
    expect(state.next_action).toBe("Run /gsd:plan-phase 8");
  });

  it("should accept next_action as null", () => {
    const state: GsdState = {
      milestone: null,
      milestone_name: null,
      status: null,
      current_phase: null,
      last_activity: null,
      next_action: null,
      progress: {
        percent: null,
        completed_phases: null,
        total_phases: null,
        completed_plans: null,
        total_plans: null,
      },
      blockers: [],
    };
    expect(state.next_action).toBeNull();
  });
});
