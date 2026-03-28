import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests verify GsdTask type shape and api.gsd.tasks methods.

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GsdTask type shape", () => {
  it("GsdTask interface exists and can be used as a type annotation", () => {
    // GsdTask is a TypeScript interface — no runtime value exists.
    // This test verifies the shape compiles correctly via the assign tests below.
    expect(true).toBe(true);
  });

  it("should allow assigning a valid GsdTask", async () => {
    // This is a compile-time check — we import the type and assign
    const { } = await import("../types");
    // If TypeScript compiles this test, the interface is correct
    const task: import("../types").GsdTask = {
      id: 1,
      project_key: "my-project",
      title: "Fix the bug",
      description: "A description",
      archived: 0,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    expect(task.id).toBe(1);
    expect(task.project_key).toBe("my-project");
    expect(task.title).toBe("Fix the bug");
    expect(task.description).toBe("A description");
    expect(task.archived).toBe(0);
    expect(task.created_at).toBe("2026-03-28T00:00:00.000Z");
  });

  it("should allow description to be null", async () => {
    const task: import("../types").GsdTask = {
      id: 2,
      project_key: "proj",
      title: "No description",
      description: null,
      archived: 0,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    expect(task.description).toBeNull();
  });

  it("should allow archived to be 1", async () => {
    const task: import("../types").GsdTask = {
      id: 3,
      project_key: "proj",
      title: "Archived task",
      description: null,
      archived: 1,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    expect(task.archived).toBe(1);
  });
});

describe("api.gsd.tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tasks.list calls GET /api/gsd/projects/:key/tasks without archived param by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [] }),
    });

    const { api } = await import("../api");
    await api.gsd.tasks.list("my-project");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("tasks.list calls GET /api/gsd/projects/:key/tasks?archived=true when archived=true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [] }),
    });

    const { api } = await import("../api");
    await api.gsd.tasks.list("my-project", true);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks?archived=true",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("tasks.list URL-encodes project key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [] }),
    });

    const { api } = await import("../api");
    await api.gsd.tasks.list("my project/key");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my%20project%2Fkey/tasks",
      expect.any(Object)
    );
  });

  it("tasks.create calls POST /api/gsd/projects/:key/tasks with title and description", async () => {
    const createdTask: import("../types").GsdTask = {
      id: 10,
      project_key: "my-project",
      title: "New task",
      description: "Details",
      archived: 0,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createdTask,
    });

    const { api } = await import("../api");
    const result = await api.gsd.tasks.create("my-project", "New task", "Details");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "New task", description: "Details" }),
      })
    );
    expect(result).toEqual(createdTask);
  });

  it("tasks.create works without description", async () => {
    const createdTask: import("../types").GsdTask = {
      id: 11,
      project_key: "my-project",
      title: "No desc",
      description: null,
      archived: 0,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createdTask,
    });

    const { api } = await import("../api");
    await api.gsd.tasks.create("my-project", "No desc");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "No desc", description: undefined }),
      })
    );
  });

  it("tasks.update calls PATCH /api/gsd/projects/:key/tasks/:id with patch body", async () => {
    const updatedTask: import("../types").GsdTask = {
      id: 5,
      project_key: "my-project",
      title: "Updated title",
      description: null,
      archived: 0,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedTask,
    });

    const { api } = await import("../api");
    const result = await api.gsd.tasks.update("my-project", 5, { title: "Updated title" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks/5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Updated title" }),
      })
    );
    expect(result).toEqual(updatedTask);
  });

  it("tasks.update supports archiving a task", async () => {
    const archivedTask: import("../types").GsdTask = {
      id: 6,
      project_key: "my-project",
      title: "Old task",
      description: null,
      archived: 1,
      created_at: "2026-03-28T00:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => archivedTask,
    });

    const { api } = await import("../api");
    const result = await api.gsd.tasks.update("my-project", 6, { archived: 1 });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gsd/projects/my-project/tasks/6",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ archived: 1 }),
      })
    );
    expect(result.archived).toBe(1);
  });
});
