import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerifyBadge } from "../VerifyBadge";
import type { GsdProject } from "../../lib/types";

function fixture(overrides: Partial<GsdProject> = {}): GsdProject {
  return {
    name: "test-project",
    root: "/path/test-project",
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

describe("VerifyBadge", () => {
  it("renders nothing when verifyState is undefined", () => {
    const { container } = render(<VerifyBadge project={fixture()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when verifyState is 'verify-passed'", () => {
    const { container } = render(
      <VerifyBadge project={fixture({ verifyState: "verify-passed" })} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Verifying...' badge for verifying state", () => {
    render(<VerifyBadge project={fixture({ verifyState: "verifying" })} />);
    expect(screen.getByText("Verifying...")).toBeInTheDocument();
  });

  it("renders 'Check failed' badge and retry button for verify-failed state", () => {
    render(<VerifyBadge project={fixture({ verifyState: "verify-failed" })} />);
    expect(screen.getByText("Check failed")).toBeInTheDocument();
    expect(screen.getByText("Try to fix it?")).toBeInTheDocument();
  });

  it("renders verifyFailureSummary text when set", () => {
    render(
      <VerifyBadge
        project={fixture({
          verifyState: "verify-failed",
          verifyFailureSummary: "UAT test failed: login button missing",
        })}
      />
    );
    expect(
      screen.getByText("UAT test failed: login button missing")
    ).toBeInTheDocument();
  });
});
