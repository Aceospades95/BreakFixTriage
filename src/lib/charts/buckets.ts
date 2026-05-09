/**
 * Time-bucket helpers for dashboards.
 *
 * Round-3 §J27. The "Closed tickets last 12 months" chart on the
 * Overview dashboard skipped months with zero closures, producing
 * a chart with missing ticks. This module is the single source of
 * truth for bucket generation; every time-series chart uses it.
 *
 * Convention:
 *   - Buckets are UTC-aligned. The chart label can be rendered in
 *     the viewer's timezone via the LocalTime component.
 *   - The output is ordered ascending by bucket key.
 *   - Zero-count buckets are included.
 *
 * Usage:
 *   const closed = await prisma.ticket.findMany({
 *     where: { closedAt: { gte: from } },
 *     select: { closedAt: true },
 *   });
 *   const buckets = monthBuckets(from, now, closed.map((t) => t.closedAt!));
 */

export interface MonthBucket {
  /** YYYY-MM, e.g. "2026-04". Stable sort key. */
  key: string;
  /** Localised label, e.g. "Apr 2026". */
  label: string;
  /** Count of values that fell into this bucket. */
  count: number;
  /** First moment of the bucket, UTC. Useful for chart x-axis. */
  start: Date;
}

/**
 * Generate one bucket per calendar month from `from` (inclusive)
 * through `to` (inclusive of the bucket containing `to`), counting
 * how many of the `values` (non-null Date instances) fell into
 * each bucket.
 *
 * Bucket boundaries:
 *   bucket "2026-04" is [2026-04-01T00:00:00Z, 2026-05-01T00:00:00Z).
 *
 * Edge cases:
 *   - When `from > to`, returns an empty array.
 *   - When `values` has dates outside the [from, to] range, those
 *     dates are still counted iff they fall into a generated bucket
 *     (they won't, given the bucket-generation walks the same
 *     range — but the implementation is defensive and uses the
 *     bucket lookup map so a future caller can pass values
 *     outside the range without crashing).
 */
export function monthBuckets(
  from: Date,
  to: Date,
  values: Date[],
): MonthBucket[] {
  if (from.getTime() > to.getTime()) return [];

  const buckets: MonthBucket[] = [];
  const seen = new Map<string, MonthBucket>();

  let cur = startOfMonthUTC(from);
  const last = startOfMonthUTC(to);

  while (cur.getTime() <= last.getTime()) {
    const key = bucketKey(cur);
    const bucket: MonthBucket = {
      key,
      label: formatLabel(cur),
      count: 0,
      start: cur,
    };
    buckets.push(bucket);
    seen.set(key, bucket);
    cur = addOneMonthUTC(cur);
  }

  for (const v of values) {
    if (!v) continue;
    const key = bucketKey(startOfMonthUTC(v));
    const bucket = seen.get(key);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

/**
 * UTC start-of-month for a Date.
 */
function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addOneMonthUTC(d: Date): Date {
  // Date.UTC handles month rollover (e.g. month 12 → year+1).
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function bucketKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatLabel(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
