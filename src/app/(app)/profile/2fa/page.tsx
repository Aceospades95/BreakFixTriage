import Link from "next/link";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { buildOtpauthUrl } from "@/lib/auth/totp";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotpAction,
  readAndClearRecoveryCookie,
} from "@/server/actions/2fa";

export const dynamic = "force-dynamic";

/**
 * 2FA setup / status page.
 *
 * Four states:
 *   - Off          → "Enable" button
 *   - Enrolling    → QR + secret + code confirmation form (cookie-backed)
 *   - On           → "Disable" + "Rotate recovery codes" controls
 *   - Just-enabled → shows recovery codes exactly once via a flash cookie
 *
 * Secrets live in an httpOnly cookie during enrollment so an
 * abandoned flow never leaves an unverified secret on the user row.
 */
export default async function TwoFactorPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      totpSecret: true,
      totpEnabledAt: true,
      backupCodes: true,
    },
  });
  if (!user) return null;

  const enabled = user.totpEnabledAt != null;
  const pending = cookies().get("bft_totp_pending")?.value ?? null;
  const recoveryCodes = enabled ? await readAndClearRecoveryCookie() : null;

  const remainingBackupCodes = (() => {
    if (!user.backupCodes) return 0;
    try {
      const arr = JSON.parse(user.backupCodes) as unknown;
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  })();

  // Enrolling: render the QR code inline.
  let qrDataUrl: string | null = null;
  if (pending && !enabled) {
    const otpauth = buildOtpauthUrl(user.email, pending);
    qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 240 });
  }

  return (
    <>
      <PageHeader
        title="Two-factor authentication"
        subtitle="TOTP via an authenticator app (Google Authenticator, 1Password, Authy, etc)."
        actions={
          <Link
            href="/profile"
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Profile
          </Link>
        }
      />

      {recoveryCodes && recoveryCodes.length > 0 && (
        <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
            Save these recovery codes somewhere safe
          </h2>
          <p className="mt-2 text-xs text-emerald-100/80">
            Each code works exactly once. Print them, store them in a
            password manager, or tape them inside a locked filing
            cabinet. You will not see them again — but an admin can
            reset your 2FA if you lose both your authenticator and
            this list.
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded border border-emerald-500/40 bg-surface p-3 font-medium tracking-tight text-sm leading-relaxed">
            {recoveryCodes.join("\n")}
          </pre>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-surface-border bg-surface-muted p-5">
          {enabled ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-medium tracking-tight text-[10px] uppercase text-emerald-200">
                  enabled
                </span>
                <span>
                  Enabled{" "}
                  {user.totpEnabledAt?.toISOString().slice(0, 10)}
                </span>
              </div>
              <p className="text-slate-300">
                Sign-ins on this account will now require a six-digit code
                from your authenticator app (or a one-use recovery code).
              </p>
              <p className="text-xs text-slate-500">
                {remainingBackupCodes} recovery code
                {remainingBackupCodes === 1 ? "" : "s"} remaining.
              </p>

              <form
                action={disableTotpAction}
                className="mt-6 space-y-2 border-t border-red-500/20 pt-4"
              >
                <label className="block text-xs uppercase tracking-wide text-slate-400">
                  Disable two-factor
                </label>
                <p className="text-xs text-slate-500">
                  Enter a current code to confirm. This deletes your
                  stored secret and all unused recovery codes.
                </p>
                <input
                  type="text"
                  name="code"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  className="w-40 rounded border border-surface-border bg-surface px-2 py-1 font-medium tracking-tight text-sm focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30"
                >
                  Disable 2FA
                </button>
              </form>
            </div>
          ) : pending ? (
            <div className="space-y-4 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Scan this code with your authenticator
              </h2>
              {qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="TOTP QR code"
                  className="rounded bg-white p-2"
                  width={240}
                  height={240}
                />
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Or enter this secret manually
                </div>
                <code className="mt-1 block rounded bg-surface px-2 py-1 font-medium tracking-tight text-xs">
                  {pending}
                </code>
              </div>

              <form action={confirmTotpEnrollment} className="space-y-2">
                <label className="block text-xs uppercase tracking-wide text-slate-400">
                  Confirm with a code
                </label>
                <input
                  type="text"
                  name="code"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="123456"
                  className="w-40 rounded border border-surface-border bg-surface px-2 py-1 font-medium tracking-tight text-sm focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
                >
                  Enable 2FA
                </button>
              </form>
              <p className="text-xs text-slate-500">
                Enrollment expires in 10 minutes. You can safely close
                this page and start over if you need to.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-slate-300">
                Two-factor authentication is currently{" "}
                <strong className="text-slate-100">off</strong> on this
                account. Adding it takes about a minute and dramatically
                raises the cost of a stolen password.
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-400">
                <li>Install an authenticator app on your phone.</li>
                <li>Click the button below to generate a secret.</li>
                <li>Scan the QR code with your app.</li>
                <li>Type the six-digit code the app shows to confirm.</li>
                <li>Save the recovery codes we give you next.</li>
              </ol>
              <form action={beginTotpEnrollment}>
                <button
                  type="submit"
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold hover:bg-accent-strong"
                >
                  Start 2FA setup
                </button>
              </form>
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-surface-border bg-surface-muted p-4 text-xs text-slate-400">
          <h3 className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
            How 2FA works here
          </h3>
          <ul className="space-y-2">
            <li>
              Six-digit TOTP, ±30s clock drift tolerance, RFC 6238 compliant.
            </li>
            <li>
              Ten one-use recovery codes generated at enable time.
            </li>
            <li>
              Sign-in requires a valid code whenever 2FA is on.
            </li>
            <li>
              Lost both your device and the recovery codes? An admin can
              reset it from <code>/admin/users</code>.
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}
