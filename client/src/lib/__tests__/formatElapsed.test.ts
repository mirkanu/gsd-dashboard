import { describe, it, expect } from "vitest";
import { formatElapsed } from "../format";

describe("formatElapsed", () => {
  it("returns '' for null start", () => {
    expect(formatElapsed(null, Date.now())).toBe("");
  });

  it("returns '0s' for zero elapsed", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso);
    expect(formatElapsed(iso, t)).toBe("0s");
  });

  it("formats 45 seconds as '45s'", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso) + 45_000;
    expect(formatElapsed(iso, t)).toBe("45s");
  });

  it("formats 90 seconds as '1m 30s'", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso) + 90_000;
    expect(formatElapsed(iso, t)).toBe("1m 30s");
  });

  it("formats 3600 seconds as '1h 0m'", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso) + 3_600_000;
    expect(formatElapsed(iso, t)).toBe("1h 0m");
  });

  it("formats 3725 seconds as '1h 2m' (drops seconds beyond 1h)", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso) + 3_725_000;
    expect(formatElapsed(iso, t)).toBe("1h 2m");
  });

  it("returns '' for an invalid ISO string", () => {
    expect(formatElapsed("not-a-date", Date.now())).toBe("");
  });

  it("clamps negative elapsed (future start) to '0s'", () => {
    const iso = "2026-04-06T10:00:00.000Z";
    const t = Date.parse(iso) - 5_000;
    expect(formatElapsed(iso, t)).toBe("0s");
  });
});
