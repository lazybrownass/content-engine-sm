import { describe, expect, it } from "vitest";
import { addDays, dayKey, getMonthGridDays, getWeekDays, startOfWeek } from "@/features/publishing/calendar";

describe("startOfWeek / getWeekDays", () => {
  it("returns the Monday on or before a mid-week anchor", () => {
    const wednesday = new Date(2026, 2, 18); // Wed Mar 18, 2026
    const monday = startOfWeek(wednesday);
    expect(monday.toDateString()).toBe(new Date(2026, 2, 16).toDateString());
  });

  it("returns the same date when the anchor is already a Monday", () => {
    const monday = new Date(2026, 2, 16);
    expect(startOfWeek(monday).toDateString()).toBe(monday.toDateString());
  });

  it("getWeekDays returns exactly 7 consecutive days starting Monday", () => {
    const days = getWeekDays(new Date(2026, 2, 18));
    expect(days).toHaveLength(7);
    expect(days[0].toDateString()).toBe(new Date(2026, 2, 16).toDateString());
    expect(days[6].toDateString()).toBe(new Date(2026, 2, 22).toDateString());
  });
});

describe("getMonthGridDays", () => {
  it("always returns 42 days", () => {
    expect(getMonthGridDays(new Date(2026, 2, 18))).toHaveLength(42);
  });

  it("starts on the Monday on/before the 1st, for a month starting on Sunday", () => {
    // March 1, 2026 is a Sunday -> grid should start Monday Feb 23, 2026.
    const days = getMonthGridDays(new Date(2026, 2, 18));
    expect(days[0].toDateString()).toBe(new Date(2026, 1, 23).toDateString());
  });

  it("includes every day of the anchor month", () => {
    const days = getMonthGridDays(new Date(2026, 2, 18));
    expect(days.some((d) => d.toDateString() === new Date(2026, 2, 1).toDateString())).toBe(true);
    expect(days.some((d) => d.toDateString() === new Date(2026, 2, 31).toDateString())).toBe(true);
  });
});

describe("addDays", () => {
  it("does not mutate the input date", () => {
    const original = new Date(2026, 2, 18);
    const copy = new Date(original);
    addDays(original, 5);
    expect(original.getTime()).toBe(copy.getTime());
  });
});

describe("dayKey", () => {
  it("buckets a UTC instant into the correct calendar day per timezone", () => {
    // 2026-01-01T23:30:00Z is already Jan 2 in Auckland (UTC+13) but still Jan 1 in Los Angeles (UTC-8).
    const instant = new Date("2026-01-01T23:30:00Z");
    expect(dayKey(instant, "Pacific/Auckland")).toBe("2026-01-02");
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-01-01");
  });

  it("returns a stable YYYY-MM-DD format", () => {
    const instant = new Date("2026-07-04T12:00:00Z");
    expect(dayKey(instant, "UTC")).toBe("2026-07-04");
  });
});
