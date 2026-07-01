import type { ReactNode } from "react";

export function PageHeader({
  title,
  titleAccessory,
  subtitle,
  actions,
}: {
  title: string;
  /**
   * Round-22 (demo feedback) — rendered inline right after the title.
   * The ticket page uses it for the headline status chip so "awaiting
   * parts" sits next to the incident number instead of hiding in the
   * top-right corner.
   */
  titleAccessory?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {titleAccessory}
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
