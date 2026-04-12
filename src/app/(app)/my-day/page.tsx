import { redirect } from "next/navigation";

/**
 * My Day now lives on the homepage (/). Redirect for bookmarks and
 * keyboard-shortcut muscle memory.
 */
export default function MyDayRedirect() {
  redirect("/");
}
