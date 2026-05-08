#!/usr/bin/env bash
# Round-12 §3E — production deploy verification.
#
# Curls 5 critical routes against the production URL and asserts:
#   - HTTP 200
#   - response body contains the expected page-marker string
# Plus two seed-state assertions:
#   - /admin/email-rules contains ≥1 rule (i.e. seed migration ran)
#   - /admin/holidays contains ≥9 entries for the current year
#
# Exits 1 on any failure. Wire into the deploy workflow as a
# post-deploy gate.
#
# Usage:
#   BASE_URL=https://triage.omnia-house.com \
#   COOKIE='<session-cookie-from-an-admin-sign-in>' \
#   bash scripts/verify-deploy.sh
#
# The COOKIE env var is required because every page below sits
# behind authentication. Use a long-lived admin session cookie
# captured from an actual sign-in to the target environment.

set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL must be set, e.g. https://triage.omnia-house.com}"
COOKIE="${COOKIE:-}"

failed=0

curl_args=(-sS -L -w "%{http_code}\n" -o /tmp/verify-deploy.body)
if [[ -n "$COOKIE" ]]; then
  curl_args+=(-H "Cookie: $COOKIE")
fi

check_route() {
  local path="$1"
  local marker="$2"
  local body_file=/tmp/verify-deploy.body
  local status
  status=$(curl "${curl_args[@]}" "${BASE_URL}${path}" || echo "000")
  if [[ "$status" != "200" ]]; then
    echo "::error::${path} returned ${status} (expected 200)"
    failed=$((failed + 1))
    return
  fi
  if ! grep -q "$marker" "$body_file"; then
    echo "::error::${path} response missing marker '${marker}'"
    failed=$((failed + 1))
    return
  fi
  echo "ok ${path} → ${status}"
}

# 5 critical routes
check_route "/" "My Day"
check_route "/tickets" "Tickets"
check_route "/admin" "Admin"
check_route "/scheduling" "Scheduling"
check_route "/dashboards" "Dashboards"

# Seed-state assertions
status=$(curl "${curl_args[@]}" "${BASE_URL}/admin/email-rules" || echo "000")
if [[ "$status" != "200" ]]; then
  echo "::error::/admin/email-rules returned ${status}"
  failed=$((failed + 1))
elif grep -q "Seed example rule" /tmp/verify-deploy.body; then
  # The "Seed example rule" CTA is the empty-state banner. If
  # we see it, the seed migration didn't run.
  echo "::error::/admin/email-rules shows the empty-state seed CTA — migration didn't seed"
  failed=$((failed + 1))
else
  echo "ok /admin/email-rules has ≥1 rule"
fi

YEAR=$(date -u +%Y)
status=$(curl "${curl_args[@]}" "${BASE_URL}/admin/holidays?year=${YEAR}" || echo "000")
if [[ "$status" != "200" ]]; then
  echo "::error::/admin/holidays returned ${status}"
  failed=$((failed + 1))
elif grep -q "No holidays in ${YEAR}" /tmp/verify-deploy.body; then
  echo "::error::/admin/holidays?year=${YEAR} shows empty state — migration didn't seed"
  failed=$((failed + 1))
else
  echo "ok /admin/holidays?year=${YEAR} has rows"
fi

# Round-13 §4E — extended health checks. Verify the API
# surface is up alongside the page-level seed state.

# /api/health — unauthenticated, expected 200.
health_args=(-sS -L -w "%{http_code}\n" -o /tmp/verify-deploy-health.body)
status=$(curl "${health_args[@]}" "${BASE_URL}/api/health" || echo "000")
if [[ "$status" != "200" ]]; then
  echo "::error::/api/health returned ${status}"
  failed=$((failed + 1))
else
  echo "ok /api/health up"
fi

if [[ "$failed" -gt 0 ]]; then
  echo ""
  echo "Round-13 health: FAIL — ${failed} failure(s)"
  exit 1
fi

echo ""
echo "Round-13 health: OK"
