"use client";

import { useEffect, useState } from "react";

/**
 * Round-10 §1E — observe the parent form's checkbox count so the
 * Bulk actions row can disable when nothing is checked + show
 * "(N selected)". The form lives upstream in /tickets/page.tsx;
 * this component uses an effect that subscribes to the form's
 * change events.
 *
 * The component renders no UI of its own — it returns a render
 * prop with the count. Callers wire the count into their button
 * disabled / aria-disabled state.
 */
export function BulkSelectionWatcher({
  formId,
  inputName,
  children,
}: {
  formId: string;
  inputName: string;
  children: (count: number) => React.ReactNode;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const recount = () => {
      const checked = form.querySelectorAll(
        `input[type=checkbox][name="${inputName}"]:checked`,
      );
      setCount(checked.length);
    };
    recount();
    form.addEventListener("change", recount);
    return () => form.removeEventListener("change", recount);
  }, [formId, inputName]);
  return <>{children(count)}</>;
}
