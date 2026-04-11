/**
 * Default loading state for any page in the (app) route group.
 * Next.js automatically shows this while a server component awaits
 * data, so the user sees structure immediately instead of a blank
 * screen during slow Prisma queries.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 rounded bg-surface-muted" />
      <div className="h-4 w-96 rounded bg-surface-muted/60" />
      <div className="mt-8 space-y-3">
        <div className="h-12 rounded bg-surface-muted" />
        <div className="h-12 rounded bg-surface-muted" />
        <div className="h-12 rounded bg-surface-muted" />
        <div className="h-12 rounded bg-surface-muted" />
        <div className="h-12 rounded bg-surface-muted" />
      </div>
    </div>
  );
}
