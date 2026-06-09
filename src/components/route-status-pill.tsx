import type { RouteStatus } from "@prisma/client";
import { humanise } from "@/lib/format";

/**
 * Round-14 — shared route-status pill. Previously duplicated inline
 * in /scheduling and /scheduling/routes/[routeId]; extracted when the
 * /scheduling/routes index page became the third consumer.
 */
export function RouteStatusPill({ status }: { status: RouteStatus }) {
  const cls: Record<RouteStatus, string> = {
    DRAFT: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    PLANNED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
    IN_PROGRESS: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    CANCELLED: "bg-red-500/20 text-red-200 border-red-500/40",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls[status]}`}
    >
      {humanise(status)}
    </span>
  );
}
