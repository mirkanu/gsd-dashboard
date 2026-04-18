import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../Sidebar";

function renderSidebar(wsConnected: boolean, collapsed = false) {
  return render(
    <MemoryRouter>
      <Sidebar wsConnected={wsConnected} collapsed={collapsed} onToggle={() => {}} />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("should render the brand name", () => {
    renderSidebar(true);
    expect(screen.getByText("GSD Dashboard")).toBeInTheDocument();
  });

  it("should render the subtitle", () => {
    renderSidebar(true);
    expect(screen.getByText("Claude Code Monitor")).toBeInTheDocument();
  });

  it("should render surviving agent-submenu navigation links", () => {
    renderSidebar(true);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("should NOT render removed navigation labels", () => {
    renderSidebar(true);
    expect(screen.queryByText("Agent Board")).not.toBeInTheDocument();
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity Feed")).not.toBeInTheDocument();
  });

  it('should show "Live" when WebSocket is connected', () => {
    renderSidebar(true);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it('should show "Disconnected" when WebSocket is not connected', () => {
    renderSidebar(false);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("should NOT link to removed routes", () => {
    renderSidebar(true);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/kanban");
    expect(hrefs).not.toContain("/sessions");
    expect(hrefs).not.toContain("/activity");
  });
});
