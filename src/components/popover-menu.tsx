"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Shared topbar popover primitive.
 *
 * Closes findings §3.A4 + §3.A5: notification bell, help menu, and
 * any future header dropdown all dismiss the same way:
 *
 *   1. Outside click anywhere on the page.
 *   2. Escape key.
 *   3. Route change (usePathname() changes).
 *   4. Opening another popover — only one is open at a time. Each
 *      PopoverMenu broadcasts via a shared module-level signal so a
 *      sibling closes when this one opens.
 *
 * Body of the popover is portaled to document.body so the fixed
 * top-bar's flex layout doesn't clip or reposition it. The trigger
 * keeps `aria-expanded`, `aria-controls`, and `id` correctly wired.
 *
 * Search and other interactive elements are clickable while a
 * popover is open because the popover panel is positioned with a
 * `pointer-events: auto` only on itself; the rest of the screen
 * stays mouse-clickable. (The previous NotificationBell used a
 * full-screen overlay div for outside-click which is what stole
 * mouse events.)
 */

interface PopoverContextValue {
  triggerRect: DOMRect | null;
  panelId: string;
  close: () => void;
}

const Ctx = createContext<PopoverContextValue | null>(null);

// Cross-instance signal so opening one popover closes all the
// others. Keyed by a unique id minted per <PopoverMenu> mount.
type Listener = (openId: string | null) => void;
const subscribers = new Set<Listener>();
function broadcast(openId: string | null) {
  for (const fn of subscribers) fn(openId);
}

export function PopoverMenu({
  trigger,
  children,
  panelClassName,
  align = "right",
}: {
  trigger: ReactElement;
  children: ReactNode;
  panelClassName?: string;
  align?: "left" | "right";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const lastPathname = useRef(pathname);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    broadcast(null);
  }, []);

  // Subscribe to "another popover opened" so we can close ourselves.
  useEffect(() => {
    const fn: Listener = (openId) => {
      if (openId !== null && openId !== id) setOpen(false);
    };
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, [id]);

  // Close on route change. usePathname() is reactive in App Router.
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Close on outside click. We listen on `document` and check
  // whether the event target is inside either the trigger or the
  // panel; if not, close. Using `mousedown` so the close fires
  // before any new focus / click handler runs on the destination.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [open]);

  // Wire the consumer's trigger element with our handlers + a11y.
  if (!isValidElement(trigger)) {
    throw new Error("PopoverMenu: `trigger` must be a single React element");
  }
  const triggerProps = (trigger.props ?? {}) as Record<string, unknown>;
  const onClick = triggerProps.onClick as
    | ((e: React.MouseEvent) => void)
    | undefined;
  const ref = (trigger as { ref?: React.Ref<HTMLElement> }).ref;

  const wrappedTrigger = cloneElement(trigger, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object")
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    onClick: (e: React.MouseEvent) => {
      onClick?.(e);
      const next = !open;
      setOpen(next);
      broadcast(next ? id : null);
    },
    "aria-haspopup": "true",
    "aria-expanded": open ? "true" : "false",
    "aria-controls": id,
  } as Record<string, unknown>);

  const rect = triggerRef.current?.getBoundingClientRect() ?? null;

  return (
    <Ctx.Provider value={{ triggerRect: rect, panelId: id, close }}>
      {wrappedTrigger}
      {mounted && open && rect &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="menu"
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              ...(align === "right"
                ? { right: window.innerWidth - rect.right }
                : { left: rect.left }),
              zIndex: 60,
            }}
            className={cn(
              "rounded-lg border border-surface-border bg-surface-muted shadow-xl",
              panelClassName,
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function usePopoverClose(): () => void {
  const ctx = useContext(Ctx);
  return useCallback(() => ctx?.close(), [ctx]);
}
