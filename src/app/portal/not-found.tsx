/**
 * Round-4 §G29 — portal-scoped 404.
 *
 * Lives inside the /portal route segment so school-side URL
 * typos surface with the same chrome the portal page uses
 * (rather than dropping into the auth-gated `(app)` chrome,
 * which would force a sign-in page on a school user). No
 * "Report broken link" — public page.
 */
export default function PortalNotFound() {
  return (
    <main
      data-not-found="portal"
      className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-10 text-center"
    >
      <h1 className="text-2xl font-semibold text-slate-100">
        That page isn&apos;t available
      </h1>
      <p className="mt-3 max-w-prose text-sm text-slate-300">
        The portal link you followed has either expired or never existed.
        If your school has been issued a portal token, ask the IT lead
        for the correct URL — the link is shaped
        <code className="mx-1 rounded bg-surface-muted px-2 py-0.5 text-xs">
          /portal/&lt;token&gt;
        </code>
        and is unique per school.
      </p>
      <p className="mt-2 max-w-prose text-xs text-slate-500">
        If you reached this page through an email or text from your IT
        lead, reply asking them to regenerate the link.
      </p>
    </main>
  );
}
