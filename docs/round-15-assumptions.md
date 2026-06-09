# Round-15 assumptions

1. **The email templates are the contract; call sites adapt.** When
   the variable shapes disagreed, we changed the seven call sites
   to satisfy the seeded templates rather than dumbing the
   templates down to flat ids — the templates are operator-editable
   and their `{{ticket.school}}`-style placeholders are the
   documented surface. The contract test pins the direction.

2. **`NEXTAUTH_URL` is the email link base.** `appBaseUrl()` reads
   it (documented in .env.example as "the URL a browser uses to
   reach the app") with a localhost fallback for dev. If a deploy
   ever splits browser URL from email-link URL, introduce
   `EMAIL_LINK_BASE_URL` then.

3. **Memory provider is a test seam, not a transport.** It is
   selectable only via `EMAIL_PROVIDER=memory` and holds messages
   in process memory; nothing guards against production misuse
   beyond the env contract. Acceptable: the same env var already
   selects stdout, which equally delivers nothing.

4. **Slate remap over per-usage sweep.** ~170 `text-slate-500`
   usages fail AA per theme; we extended the existing
   `:root:not(.dark)` remap layer (and added a `:root.dark` layer
   for slate-500/600) instead of editing 68 files. This keeps the
   Round-12 §1G design: components write dark-first Tailwind
   literals, globals.css owns theme correctness.

5. **Exceptions thresholds are starting points.** Stuck-import
   (1h), token-expiry window (30d), and severity window (7d) are
   constants at the top of the page, not settings. Promote to
   AppSetting only when an operator actually asks to tune them.

6. **Dev-seed renames don't migrate existing prod data.** The C1
   renames apply on the next `db:seed` run (the upsert updates
   `name`). Production users created from the old seed keep their
   names until reseeded — cosmetic, acceptable.
