import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StageBadge } from "../StageBadge";
import { StageBackfillChip } from "../StageBackfillChip";

// Mock the api module
vi.mock("../../lib/api", () => ({
  api: {
    gsd: {
      stageTransition: vi.fn(),
    },
  },
}));

describe("StageBadge", () => {
  it("renders Draft badge with correct label", () => {
    render(<StageBadge stage="draft" />);
    expect(screen.getByText(/Draft/)).toBeInTheDocument();
  });

  it("renders Alpha badge with correct label", () => {
    render(<StageBadge stage="alpha" />);
    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
  });

  it("renders Beta badge with correct label", () => {
    render(<StageBadge stage="beta" />);
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
  });

  it("renders Launched badge with correct label", () => {
    render(<StageBadge stage="launched" />);
    expect(screen.getByText(/Launched/)).toBeInTheDocument();
  });

  it("renders Maintenance badge with correct label", () => {
    render(<StageBadge stage="maintenance" />);
    expect(screen.getByText(/Maintenance/)).toBeInTheDocument();
  });

  it("renders Retired badge with correct label", () => {
    render(<StageBadge stage="retired" />);
    expect(screen.getByText(/Retired/)).toBeInTheDocument();
  });

  it("renders null when stage is undefined", () => {
    const { container } = render(<StageBadge stage={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null when stage is null", () => {
    const { container } = render(<StageBadge stage={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("has aria-label for accessibility", () => {
    render(<StageBadge stage="beta" />);
    expect(screen.getByLabelText(/beta/i)).toBeInTheDocument();
  });

  it("applies sm size classes", () => {
    const { container } = render(<StageBadge stage="draft" size="sm" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain("text-[10px]");
    expect(span.className).toContain("px-1.5");
  });

  it("applies md size classes by default", () => {
    const { container } = render(<StageBadge stage="draft" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain("text-xs");
    expect(span.className).toContain("px-2");
  });
});

describe("StageBackfillChip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Assign stage button", () => {
    render(<StageBackfillChip projectName="my-project" onAssigned={vi.fn()} />);
    expect(screen.getByText(/Assign stage/)).toBeInTheDocument();
  });

  it("shows stage options when button is clicked", async () => {
    render(<StageBackfillChip projectName="my-project" onAssigned={vi.fn()} />);
    fireEvent.click(screen.getByText(/Assign stage/));
    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Launched")).toBeInTheDocument();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("calls onAssigned after selecting a stage", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.stageTransition).mockResolvedValue({ success: true, stage: "alpha", project: {} as any });

    const onAssigned = vi.fn();
    render(<StageBackfillChip projectName="my-project" onAssigned={onAssigned} />);
    fireEvent.click(screen.getByText(/Assign stage/));
    fireEvent.click(await screen.findByText("Alpha"));

    await waitFor(() => {
      expect(api.gsd.stageTransition).toHaveBeenCalledWith("my-project", "alpha");
      expect(onAssigned).toHaveBeenCalledWith("alpha");
    });
  });

  it("shows error message when transition fails", async () => {
    const { api } = await import("../../lib/api");
    vi.mocked(api.gsd.stageTransition).mockRejectedValue(new Error("Network error"));

    render(<StageBackfillChip projectName="my-project" onAssigned={vi.fn()} />);
    fireEvent.click(screen.getByText(/Assign stage/));
    fireEvent.click(await screen.findByText("Draft"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });
});
