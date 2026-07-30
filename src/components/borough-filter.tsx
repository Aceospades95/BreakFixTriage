/**
 * The one borough picker every reporting surface uses.
 *
 * A plain GET form so it works without JavaScript and keeps the
 * chosen borough in the URL — which matters because these pages get
 * bookmarked and pasted into email ("here's the Bronx backlog").
 *
 * `carry` re-submits the other params the page already honours
 * (window length, thresholds, sort). A GET form replaces the whole
 * query string, so anything not re-submitted here would silently
 * reset — the same trap that reset page size on the tickets list.
 */
export function BoroughFilter({
  boroughs,
  selected,
  carry = {},
  label = "Borough",
  submitLabel = "Apply",
}: {
  boroughs: string[];
  selected?: string;
  carry?: Record<string, string | number | undefined>;
  label?: string;
  submitLabel?: string;
}) {
  if (boroughs.length === 0) return null;
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2"
      data-testid="borough-filter"
    >
      {Object.entries(carry).map(([k, v]) =>
        v === undefined || v === "" ? null : (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ),
      )}
      <label className="flex min-w-0 max-w-full flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <select
          name="borough"
          defaultValue={selected ?? ""}
          className="min-w-0 max-w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All boroughs</option>
          {boroughs.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded border border-surface-border px-3 py-1.5 text-xs transition hover:border-accent"
      >
        {submitLabel}
      </button>
    </form>
  );
}
