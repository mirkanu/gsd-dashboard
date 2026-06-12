import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectEnvironmentChips } from "../ProjectEnvironmentChips";
import type { GsdProject } from "../../lib/types";

const baseProject: GsdProject = {
  name: "test-project",
  root: "/path/to/test-project",
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
  sessionState: "working",
  statusText: null,
  sessionCost: null,
  stateEnteredAt: null,
  currentTask: null,
};

describe("ProjectEnvironmentChips", () => {
  it("renders nothing when both liveUrl and stagingUrl are absent", () => {
    const { container } = render(
      <ProjectEnvironmentChips project={baseProject} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders production chip only when liveUrl is set and stagingEnabled is false", () => {
    const project: GsdProject = {
      ...baseProject,
      liveUrl: "https://example.com",
      stagingEnabled: false,
    };
    render(<ProjectEnvironmentChips project={project} />);
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.queryByText("Staging")).not.toBeInTheDocument();
  });

  it("renders production chip only when liveUrl is set and stagingEnabled is absent", () => {
    const project: GsdProject = {
      ...baseProject,
      liveUrl: "https://example.com",
    };
    render(<ProjectEnvironmentChips project={project} />);
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.queryByText("Staging")).not.toBeInTheDocument();
  });

  it("renders both chips when liveUrl is set and stagingEnabled=true with stagingUrl", () => {
    const project: GsdProject = {
      ...baseProject,
      liveUrl: "https://example.com",
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
    };
    render(<ProjectEnvironmentChips project={project} />);
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Staging")).toBeInTheDocument();
  });

  it("renders staging chip alone when stagingEnabled=true even if liveUrl is null", () => {
    const project: GsdProject = {
      ...baseProject,
      liveUrl: null,
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
    };
    render(<ProjectEnvironmentChips project={project} />);
    expect(screen.queryByText("Production")).not.toBeInTheDocument();
    expect(screen.getByText("Staging")).toBeInTheDocument();
  });

  it("staging chip dot is bg-red-500 when stagingStatus is stopped", () => {
    const project: GsdProject = {
      ...baseProject,
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
      stagingStatus: "stopped",
    };
    const { container } = render(<ProjectEnvironmentChips project={project} />);
    const dots = container.querySelectorAll("span.rounded-full");
    const stagingDot = Array.from(dots).find((el) =>
      el.className.includes("bg-red-500")
    );
    expect(stagingDot).toBeTruthy();
  });

  it("staging chip dot is bg-green-500 when stagingStatus is running", () => {
    const project: GsdProject = {
      ...baseProject,
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
      stagingStatus: "running",
    };
    const { container } = render(<ProjectEnvironmentChips project={project} />);
    const dots = container.querySelectorAll("span.rounded-full");
    const stagingDot = Array.from(dots).find((el) =>
      el.className.includes("bg-green-500")
    );
    expect(stagingDot).toBeTruthy();
  });

  it("staging chip dot is bg-gray-400 when stagingStatus is undefined", () => {
    const project: GsdProject = {
      ...baseProject,
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
    };
    const { container } = render(<ProjectEnvironmentChips project={project} />);
    const dots = container.querySelectorAll("span.rounded-full");
    const stagingDot = Array.from(dots).find((el) =>
      el.className.includes("bg-gray-400")
    );
    expect(stagingDot).toBeTruthy();
  });

  it("both chips open in new tab with rel=noopener noreferrer", () => {
    const project: GsdProject = {
      ...baseProject,
      liveUrl: "https://example.com",
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
    };
    render(<ProjectEnvironmentChips project={project} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("prepends https:// to stagingUrl when no protocol prefix", () => {
    const project: GsdProject = {
      ...baseProject,
      stagingEnabled: true,
      stagingUrl: "test-staging.gsdlabs.dev",
    };
    render(<ProjectEnvironmentChips project={project} />);
    const link = screen.getByText("Staging").closest("a");
    expect(link).toHaveAttribute("href", "https://test-staging.gsdlabs.dev");
  });
});
