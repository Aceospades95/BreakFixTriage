#!/usr/bin/env bash
# Round-6 §3C — Forbidden-tokens grep hard-gate.
#
# Mirrors `tests/forbidden-tokens.test.ts` so a violation flunks
# both the local Vitest run and this CI gate. Exits non-zero on any
# match outside `.cigrep-allow`.
#
# Rules enforced:
#   1. `font-mono` outside <code>/<pre> JSX elements.
#   2. ALL_CAPS_UNDERSCORE (`[A-Z][A-Z0-9_]{3,}` containing `_`)
#      inside JSX text nodes or text-rendering props, except inside
#      <code>/<pre>.
#   3. Raw cuids `cm[a-z0-9]{20,}` inside JSX text. No allowlist.
#   4. Bare CLI commands (`npm run`, `pnpm`, `yarn`, `prisma`, `npx`,
#      `tsx scripts/`) in JSX text.
#
# Excluded paths: `node_modules`, `.next`, `dist`, `tests/fixtures`,
# `*.test.ts`, `*.spec.ts`. Tests can use forbidden tokens as round-
# trip fixtures.
#
# Allowlist file: `.cigrep-allow` is one regex per line (extended).
# A match is suppressed when any allowlist pattern matches the literal
# token (not the surrounding line). Lines starting with `#` are
# comments. Empty file = zero suppressions.

set -euo pipefail

ROOT="${1:-$(pwd)}"
ALLOW_FILE="${ROOT}/.cigrep-allow"

# Build the allowlist regex once.
ALLOW_RE=""
if [[ -f "$ALLOW_FILE" ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue
    if [[ -z "$ALLOW_RE" ]]; then
      ALLOW_RE="$line"
    else
      ALLOW_RE="${ALLOW_RE}|${line}"
    fi
  done < "$ALLOW_FILE"
fi

is_allowed() {
  local token="$1"
  [[ -z "$ALLOW_RE" ]] && return 1
  echo "$token" | grep -Eq "$ALLOW_RE"
}

# All four rules implemented in a single perl pass per file. Returns
# `path:line: rule(<name>) · <token>` for every offence.
violations=0

mapfile -d '' FILES < <(
  find "${ROOT}/src" -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.next/*' \
    -not -path '*/dist/*' \
    -not -path '*/tests/fixtures/*' \
    -not -name '*.test.ts' \
    -not -name '*.test.tsx' \
    -not -name '*.spec.ts' \
    -not -name '*.spec.tsx' \
    -print0
)

scan_output=$(mktemp)
trap 'rm -f "$scan_output"' EXIT

for file in "${FILES[@]}"; do
  perl -0777 -ne '
    my $src = $_;
    # Strip block + line comments.
    $src =~ s|/\*[\s\S]*?\*/||g;
    $src =~ s|^//[^\n]*$||mg;
    $src =~ s|(\s)//[^\n]*$|$1|mg;

    sub line_at {
      my ($s, $pos) = @_;
      return (substr($s, 0, $pos) =~ tr/\n//) + 1;
    }

    sub in_code_or_pre {
      my ($before) = @_;
      my $last_open = rindex($before, "<");
      return 0 if $last_open < 0;
      my $tag = lc(substr($before, $last_open, 6));
      return 1 if $tag =~ /^<code/;
      return 1 if $tag =~ /^<pre/;
      return 0;
    }

    # Rule 1: font-mono outside <code>/<pre>.
    while ($src =~ /font-mono/g) {
      my $pos = $-[0];
      my $line = line_at($src, $pos);
      my $start = $pos - 200;
      $start = 0 if $start < 0;
      my $window = substr($src, $start, $pos - $start + 200);
      next if $window =~ /<code|<pre/;
      print "$ARGV:$line: rule(font-mono) \xc2\xb7 font-mono\n";
    }

    # Rule 2: ALL_CAPS_UNDERSCORE inside JSX text spans.
    while ($src =~ />([^<>{}\n]{1,300})</g) {
      my $text = $1;
      my $pos  = $-[0] + 1;
      my $before = substr($src, 0, $pos);
      next if in_code_or_pre($before);
      my $line = line_at($src, $pos);
      while ($text =~ /\b([A-Z][A-Z0-9_]{3,})\b/g) {
        my $tok = $1;
        next unless $tok =~ /_/;
        print "$ARGV:$line: rule(ALL_CAPS) \xc2\xb7 $tok\n";
      }
    }

    # Rule 2b: text-rendering props.
    while ($src =~ /\b(placeholder|title|aria-label|description|helperText|label)="([^"\n]{1,300})"/g) {
      my $val  = $2;
      my $pos  = $-[2];
      my $line = line_at($src, $pos);
      while ($val =~ /\b([A-Z][A-Z0-9_]{3,})\b/g) {
        my $tok = $1;
        next unless $tok =~ /_/;
        print "$ARGV:$line: rule(ALL_CAPS) \xc2\xb7 $tok\n";
      }
    }

    # Rule 3: raw cuids in JSX text.
    while ($src =~ />([^<>{}\n]{1,300})</g) {
      my $text = $1;
      my $pos  = $-[0] + 1;
      my $line = line_at($src, $pos);
      while ($text =~ /\b(cm[a-z0-9]{20,})\b/g) {
        my $tok = $1;
        print "$ARGV:$line: rule(cuid) \xc2\xb7 $tok\n";
      }
    }

    # Rule 4: bare CLI commands in JSX text.
    while ($src =~ />([^<>{}\n]{1,300})</g) {
      my $text = $1;
      my $pos  = $-[0] + 1;
      my $before = substr($src, 0, $pos);
      next if in_code_or_pre($before);
      my $line = line_at($src, $pos);
      while ($text =~ /\b(npm run|pnpm |yarn |prisma |npx |tsx scripts\/)/g) {
        my $tok = $1;
        print "$ARGV:$line: rule(cli) \xc2\xb7 $tok\n";
      }
    }

    # Rule 5: known enum values rendered as user-facing JSX text.
    # Round-7 §2A + §2B extend the gate to catch single-word
    # QuoteStatus / ImportType / ImportSource / JobType / TicketPriority
    # values that the underscore-required Rule 2 misses. The list is
    # explicit so legitimate prose (e.g. "Send the email") is not
    # falsely flagged.
    my %ENUM_VALUES = map { $_ => 1 } qw(
      DRAFT SENT APPROVED DECLINED CANCELLED NO_RESPONSE
      TICKETS SCHOOLS DEVICES USERS PARTS DEVICE_MODELS
      SN_CSV MANUAL_CSV SNOW_API SERVICENOW SERVICE_NOW
      PICKUP DELIVERY ONSITE_REPAIR
      LOW NORMAL HIGH CRITICAL
    );
    while ($src =~ />([^<>{}\n]{1,300})</g) {
      my $text = $1;
      my $pos  = $-[0] + 1;
      my $before = substr($src, 0, $pos);
      next if in_code_or_pre($before);
      my $line = line_at($src, $pos);
      while ($text =~ /\b([A-Z][A-Z0-9_]{2,})\b/g) {
        my $tok = $1;
        next unless $ENUM_VALUES{$tok};
        print "$ARGV:$line: rule(enum) \xc2\xb7 $tok\n";
      }
    }

    # Round-8 paragraph1B - devnote / env-var / URL-path / round-tag leaks
    # in user-visible JSX text. Each phrase is one observed leaking
    # into operator copy and worth catching automatically:
    #   - on the roadmap - devnote read as a promise by operators
    #   - Round-N - round identifier in user-visible copy
    #   - redeploy - inside prose
    #   - bare /admin/path /profile/path /me/path inside JSX text
    #     (paths are fine in href attributes, not in prose)
    while ($src =~ />([^<>{}\n]{1,300})</g) {
      my $text = $1;
      my $pos  = $-[0] + 1;
      my $before = substr($src, 0, $pos);
      next if in_code_or_pre($before);
      my $line = line_at($src, $pos);
      if ($text =~ /\b(on the roadmap)\b/i) {
        print "$ARGV:$line: rule(devnote) \xc2\xb7 on the roadmap\n";
      }
      if ($text =~ /\b(Round-\d+)\b/) {
        print "$ARGV:$line: rule(round-tag) \xc2\xb7 $1\n";
      }
      if ($text =~ /\bredeploy\b/i) {
        print "$ARGV:$line: rule(devnote) \xc2\xb7 redeploy\n";
      }
      while ($text =~ m{(?<![\w/])(/admin/[a-z0-9_-]+|/profile/[a-z0-9_-]+|/me/[a-z0-9_-]+)}g) {
        my $tok = $1;
        print "$ARGV:$line: rule(url-in-prose) \xc2\xb7 $tok\n";
      }
    }
  ' "$file" >> "$scan_output" || true
done

# Apply allowlist filter and count violations.
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  token=$(echo "$line" | sed -E 's/.* · //')
  is_allowed "$token" && continue
  echo "$line"
  violations=$((violations + 1))
done < "$scan_output"

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "forbidden-tokens: ${violations} violation(s)"
  exit 1
fi

echo "forbidden-tokens: clean"
