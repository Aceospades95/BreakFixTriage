"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Round-22 §4 — make a whole table row a tap target.
 *
 * Field tablets shouldn't have to hit the one small incident link. The
 * row navigates to `href` on click EXCEPT when the click lands on a real
 * interactive child (checkbox, link, button, label, select) so bulk
 * selection and inline links keep working. The explicit incident-number
 * link remains the keyboard-accessible primary target; this is a
 * pointer/touch enhancement layered on top.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      className={`${className ?? ""} cursor-pointer`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a,button,input,label,select,textarea")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
