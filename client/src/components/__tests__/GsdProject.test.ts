import { describe, it, expect } from "vitest";
import type { GsdProject } from "../../lib/types";

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
    };
    expect(project.liveUrl).toBeNull();
  });
});
