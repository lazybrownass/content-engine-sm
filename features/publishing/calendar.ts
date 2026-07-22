// Pure date-math for the /schedule week/month grid. Native Date/Intl only — no
// calendar/date library dependency (this repo has none installed and doesn't need one
// for grid arithmetic this simple).

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Monday-based start of week, midnight local time.
export function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return addDays(result, -daysSinceMonday);
}

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Always 42 days (6 full Monday-start weeks) so the grid height never shifts month to month.
export function getMonthGridDays(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// Timezone-correct "YYYY-MM-DD" bucket key for grouping a schedule under its own
// IANA timezone, independent of the server/browser's local timezone.
export function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// The /schedule page's `anchor` searchParam round-trips through these two — parsed in local
// time (not UTC) so the grid's local-time day arithmetic above stays consistent with it.
export function parseAnchorDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function formatAnchorDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
