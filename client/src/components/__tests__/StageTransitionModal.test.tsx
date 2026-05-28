import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StageTransitionModal } from "../StageTransitionModal";
import { KillArchiveModal } from "../KillArchiveModal";
import type { GsdProject } from "../../lib/types";

// Mock the api module
vi.mock("../../lib/api", () => ({
  api: {
    gsd: {
      validateStageTransition: vi.fn(),
      stageTransition: vi.fn(),
      archive: vi.fn(),
    },
  },
}));

function makeProject(overrides: Partial<GsdProject> = {}): GsdProject {
  return {
    name: "test-project",
    display_name: "Test Project",
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
    tmuxSession: null,
    contextTokens: null,
    sessionUpdatedAt: null,
    sessionState: "paused",
    statusText: null,
    sessionCost: null,
    stateEnteredAt: null,
    currentTask: null,
    ...overrides,
  };
}

describe("StageTransitionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when isOpen is false", () => {
    const { container } = render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("fetches gate validation on open", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: true,
      hardGates: [],
      softGates: [],
      requiresProvisioning: [],
    });

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(api.gsd.validateStageTransition).toHaveBeenCalledWith("test-project", "alpha");
    });
  });

  it("renders hard gates with ✗ red indicator", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: false,
      hardGates: [{ gate: "git_repo", label: "Must have GitHub repo", pass: false }],
      softGates: [],
      requiresProvisioning: [],
    });

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Must have GitHub repo")).toBeInTheDocument();
      expect(screen.getByText("✗")).toBeInTheDocument();
    });
  });

  it("disables Confirm button when hard gates fail", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: false,
      hardGates: [{ gate: "git_repo", label: "Must have GitHub repo", pass: false }],
      softGates: [],
      requiresProvisioning: [],
    });

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      const confirmBtn = screen.getByText("Cannot advance");
      expect(confirmBtn).toBeDisabled();
    });
  });

  it("enables Confirm button when all hard gates pass", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: true,
      hardGates: [],
      softGates: [],
      requiresProvisioning: [],
    });

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      const confirmBtn = screen.getByText("Confirm");
      expect(confirmBtn).not.toBeDisabled();
    });
  });

  it("calls onSuccess and onClose after successful transition", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: true,
      hardGates: [],
      softGates: [],
      requiresProvisioning: [],
    });
    vi.mocked(api.gsd.stageTransition).mockResolvedValue({
      success: true,
      stage: "alpha",
      project: makeProject({ stage: "alpha" }),
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await waitFor(() => screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("alpha");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows Confirm & Auto-Create when requiresProvisioning is non-empty", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: true,
      hardGates: [],
      softGates: [],
      requiresProvisioning: ["betterStackMonitor"],
    });

    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="launched"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Confirm & Auto-Create")).toBeInTheDocument();
    });
  });

  it("Cancel button always calls onClose", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.validateStageTransition).mockResolvedValue({
      valid: false,
      hardGates: [{ gate: "git_repo", label: "Must have GitHub repo", pass: false }],
      softGates: [],
      requiresProvisioning: [],
    });

    const onClose = vi.fn();
    render(
      <StageTransitionModal
        project={makeProject()}
        targetStage="alpha"
        isOpen={true}
        onClose={onClose}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("KillArchiveModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when isOpen is false", () => {
    const { container } = render(
      <KillArchiveModal
        project={makeProject()}
        isOpen={false}
        onClose={vi.fn()}
        onArchived={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows Archive and Delete permanently options for Draft projects", () => {
    render(
      <KillArchiveModal
        project={makeProject({ stage: "draft" })}
        isOpen={true}
        onClose={vi.fn()}
        onArchived={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Delete permanently")).toBeInTheDocument();
  });

  it("Delete permanently button leads to DELETE confirmation step", () => {
    render(
      <KillArchiveModal
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onArchived={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Delete permanently"));
    expect(screen.getByPlaceholderText("Type DELETE to confirm")).toBeInTheDocument();
  });

  it("delete button is disabled until user types DELETE", () => {
    render(
      <KillArchiveModal
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onArchived={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Delete permanently"));
    const input = screen.getByPlaceholderText("Type DELETE to confirm");
    const deleteBtn = screen.getByText("Delete permanently", { selector: "button" });

    // Button disabled initially
    expect(deleteBtn).toBeDisabled();

    // Type partial text — still disabled
    fireEvent.change(input, { target: { value: "DELET" } });
    expect(deleteBtn).toBeDisabled();

    // Type DELETE — enabled
    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(deleteBtn).not.toBeDisabled();
  });

  it("Archive button calls api.gsd.archive and onArchived", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.archive).mockResolvedValue({ ok: true });

    const onArchived = vi.fn();
    render(
      <KillArchiveModal
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onArchived={onArchived}
        onDeleted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Archive"));

    await waitFor(() => {
      expect(api.gsd.archive).toHaveBeenCalledWith("test-project");
      expect(onArchived).toHaveBeenCalled();
    });
  });
});
