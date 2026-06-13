"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

/**
 * Phase-0 reliability — guarded server-action form.
 *
 * The app's write forms were plain `<form action={serverAction}>`. That
 * pattern has two failure modes the June-2026 incident hit:
 *
 *   1. A transport-level failure (5xx from the proxy, dropped
 *      connection, hung response) surfaces NOWHERE — the tab just sits
 *      there and the operator can't tell whether the write landed.
 *   2. Nothing disables the controls while a submission is in flight,
 *      so a slow save invites a second tap of the same button.
 *
 * ActionForm keeps the exact same server-action contract (the action
 * still validates, redirects with `?ok=`/`?error=`, and revalidates) but
 * invokes it through an onSubmit handler so the client can:
 *
 *   - refuse double submission while a call is pending,
 *   - visibly disable every control in the form while pending,
 *   - surface a rejection (network failure, 5xx) as an error toast,
 *   - raise an honest "can't confirm whether this saved — reload before
 *     retrying" warning if the server doesn't answer within the
 *     watchdog window, instead of freezing silently.
 *
 * Native HTML validation (`required` etc.) still runs before submit
 * fires, so existing form semantics are unchanged.
 */

const WATCHDOG_MS = 20_000;

export type ToastKind = "ok" | "error" | "important";

/** Fire a toast on the global ToastHost from client code. */
export function emitToast(kind: ToastKind, message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("bft:toast", { detail: { kind, message } }),
  );
}

const PendingContext = createContext(false);

/**
 * True while the nearest enclosing ActionForm has a submission in
 * flight. Lets submit buttons render their own "Saving…" state.
 */
export function useActionFormPending(): boolean {
  return useContext(PendingContext);
}

export function ActionForm({
  action,
  children,
  className,
  watchdogMs = WATCHDOG_MS,
  ...rest
}: {
  action: (formData: FormData) => Promise<void> | void;
  children: ReactNode;
  className?: string;
  /** Override for tests; the 20s default is deliberately generous. */
  watchdogMs?: number;
} & Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "action" | "onSubmit" | "children" | "className"
>) {
  const [pending, setPending] = useState(false);
  // Ref-based guard as well as state: a double-tap can land before
  // React re-renders with the disabled fieldset.
  const inFlight = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const form = event.currentTarget;
    // Pass the submitter so a named submit button's value is included,
    // matching native form-submission semantics.
    const submitter = (event.nativeEvent as SubmitEvent).submitter ?? null;
    const formData = new FormData(form, submitter);

    inFlight.current = true;
    setPending(true);

    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      inFlight.current = false;
      setPending(false);
      emitToast(
        "important",
        "The server hasn't answered yet. Your change may or may not have saved — reload the page to check before trying again.",
      );
    }, watchdogMs);

    try {
      await action(formData);
      // Success path: the action redirected (the router navigates and
      // the ?ok=/?error= param drives the regular toast) or returned.
    } catch (err) {
      // Next.js redirect/notFound signals arrive as throwables carrying
      // a digest — those are navigation, not failure.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: unknown }).digest === "string" &&
        ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
          (err as { digest: string }).digest === "NEXT_NOT_FOUND")
      ) {
        throw err;
      }
      if (!timedOut) {
        emitToast(
          "error",
          "Couldn't reach the server — the change was not saved. Check your connection and try again.",
        );
      }
    } finally {
      clearTimeout(watchdog);
      if (!timedOut) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className={className} {...rest}>
      <PendingContext.Provider value={pending}>
        {/* display:contents keeps the fieldset out of layout while its
            `disabled` attribute still propagates to every control. */}
        <fieldset disabled={pending} className="contents min-w-0 border-0 p-0">
          {children}
        </fieldset>
      </PendingContext.Provider>
    </form>
  );
}
