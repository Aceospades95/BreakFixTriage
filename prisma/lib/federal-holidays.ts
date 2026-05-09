/**
 * Round-11 §1D / §1E — US federal holiday builder.
 *
 * Extracted from prisma/seed.ts so the same canonical list seeds
 * a fresh DB AND backs the /admin/holidays "Auto-seed US federal
 * holidays" action.
 *
 * The list mirrors the eleven federal holidays observed in
 * 2024-onwards:
 *
 *   - New Year's Day (January 1)
 *   - Martin Luther King Jr. Day (3rd Monday of January)
 *   - Washington's Birthday / Presidents Day (3rd Monday of Feb)
 *   - Memorial Day (last Monday of May)
 *   - Juneteenth (June 19)
 *   - Independence Day (July 4)
 *   - Labor Day (1st Monday of September)
 *   - Columbus Day / Indigenous Peoples Day (2nd Monday of Oct)
 *   - Veterans Day (November 11)
 *   - Thanksgiving Day (4th Thursday of November)
 *   - Christmas Day (December 25)
 *
 * Dates are UTC so the SLA business-hours math stays consistent
 * regardless of the operator's tz.
 */

export interface FederalHoliday {
  name: string;
  date: Date;
}

export function buildFederalHolidaysForYear(year: number): FederalHoliday[] {
  return [
    { name: "New Year's Day", date: utc(year, 0, 1) },
    { name: "Martin Luther King Jr. Day", date: nthWeekdayOfMonth(year, 0, 1, 3) },
    { name: "Washington's Birthday", date: nthWeekdayOfMonth(year, 1, 1, 3) },
    { name: "Memorial Day", date: lastMondayOfMonth(year, 4) },
    { name: "Juneteenth", date: utc(year, 5, 19) },
    { name: "Independence Day", date: utc(year, 6, 4) },
    { name: "Labor Day", date: firstMondayOfMonth(year, 8) },
    { name: "Columbus Day", date: nthWeekdayOfMonth(year, 9, 1, 2) },
    { name: "Veterans Day", date: utc(year, 10, 11) },
    { name: "Thanksgiving Day", date: nthWeekdayOfMonth(year, 10, 4, 4) },
    { name: "Christmas Day", date: utc(year, 11, 25) },
  ];
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function firstMondayOfMonth(year: number, month: number): Date {
  for (let d = 1; d <= 7; d++) {
    const date = utc(year, month, d);
    if (date.getUTCDay() === 1) return date;
  }
  throw new Error("unreachable");
}

export function lastMondayOfMonth(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = lastDay; d >= lastDay - 6; d--) {
    const date = utc(year, month, d);
    if (date.getUTCDay() === 1) return date;
  }
  throw new Error("unreachable");
}

/**
 * The nth occurrence of the given weekday in the month. weekday
 * is 0 (Sunday) — 6 (Saturday). n is 1-based.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = utc(year, month, d);
    if (date.getUTCMonth() !== month) break;
    if (date.getUTCDay() === weekday) {
      count++;
      if (count === n) return date;
    }
  }
  throw new Error("unreachable");
}
