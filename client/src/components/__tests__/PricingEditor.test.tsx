import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PricingEditor } from "../PricingEditor";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    pricing: {
      list: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const rules = [
  {
    model_pattern: "claude-opus-4%",
    display_name: "Claude Opus 4",
    input_per_mtok: 15,
    output_per_mtok: 75,
    cache_read_per_mtok: 1.5,
    cache_write_per_mtok: 18.75,
    updated_at: "2026-04-10",
  },
  {
    model_pattern: "claude-sonnet-4%",
    display_name: "Claude Sonnet 4",
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_read_per_mtok: 0.3,
    cache_write_per_mtok: 3.75,
    updated_at: "2026-04-10",
  },
];

describe("PricingEditor", () => {
  beforeEach(() => {
    vi.mocked(api.pricing.list).mockResolvedValue({ pricing: [...rules] });
    vi.mocked(api.pricing.upsert).mockResolvedValue({ pricing: rules[0] });
  });

  it("renders rules and inline tips", async () => {
    render(<PricingEditor />);
    await waitFor(() => {
      expect(screen.getByText("Claude Opus 4")).toBeInTheDocument();
      expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    });
    expect(screen.getByText(/tokens in prompts you send to Claude/i)).toBeInTheDocument();
    expect(screen.getByText(/tokens Claude generates in its reply/i)).toBeInTheDocument();
    expect(screen.getByText(/cached prompt prefix reused/i)).toBeInTheDocument();
    expect(screen.getByText(/writing a new prompt prefix/i)).toBeInTheDocument();
  });

  it("save button is disabled until an input is edited", async () => {
    render(<PricingEditor />);
    await waitFor(() => screen.getByText("Claude Opus 4"));

    const saveButtons = screen.getAllByRole("button", { name: /save/i });
    expect(saveButtons[0]).toBeDisabled();

    const opusInput = screen.getAllByDisplayValue("15")[0];
    fireEvent.change(opusInput, { target: { value: "20" } });

    expect(saveButtons[0]).not.toBeDisabled();
  });

  it("calls api.pricing.upsert with edited value and fires onChange", async () => {
    const onChange = vi.fn();
    render(<PricingEditor onChange={onChange} />);
    await waitFor(() => screen.getByText("Claude Opus 4"));

    const opusInput = screen.getAllByDisplayValue("15")[0];
    fireEvent.change(opusInput, { target: { value: "20" } });

    const saveButtons = screen.getAllByRole("button", { name: /save/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(api.pricing.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          model_pattern: "claude-opus-4%",
          display_name: "Claude Opus 4",
          input_per_mtok: 20,
        })
      );
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });
});
