#!/bin/bash
#
# External liveness check for the API, pinging a healthchecks.io-style monitor.
#
# Docker's healthcheck marks the container unhealthy but tells nobody: on
# 2026-08-06 the API sat unhealthy for seven hours with restarts=0 and no alert.
# This is the piece that actually shouts. Run it from cron on the host.
#
# Required:  HEALTHCHECK_URL   ping URL (a secret — keep it out of the repo)
# Optional:  API_HEALTH_URL    default http://127.0.0.1:3001/api/health
#            API_METRICS_URL   default http://127.0.0.1:3001/metrics
#            STATE_DIR         default /var/tmp/albionroads-uptime
#            TIMEOUT           default 10 (seconds)

set -uo pipefail

HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
API_METRICS_URL="${API_METRICS_URL:-http://127.0.0.1:3001/metrics}"
STATE_DIR="${STATE_DIR:-/var/tmp/albionroads-uptime}"
TIMEOUT="${TIMEOUT:-10}"

if [ -z "$HEALTHCHECK_URL" ]; then
  echo "HEALTHCHECK_URL is not set — nothing to ping. See docs/monitoring.md." >&2
  exit 2
fi

mkdir -p "$STATE_DIR"
SATURATION_STATE="$STATE_DIR/pool-saturated"

report() {
  # $1 = "" for success or "/fail"; $2 = human-readable detail
  echo "$2"
  curl -fsS -m "$TIMEOUT" --data-raw "$2" "${HEALTHCHECK_URL}${1}" >/dev/null 2>&1 || \
    echo "warning: could not reach the monitor to report status" >&2
}

# --- 1. Is the API answering at all? ------------------------------------------
# The failure this exists for: a pooled query hangs forever, so /api/health never
# responds. A timeout here is the symptom, so --max-time is the whole check.
body=$(curl -fsS -m "$TIMEOUT" "$API_HEALTH_URL" 2>&1)
if [ $? -ne 0 ]; then
  report "/fail" "API health check failed or timed out after ${TIMEOUT}s: ${body}"
  exit 1
fi

case "$body" in
  *'"status":"ok"'*) ;;
  *)
    report "/fail" "API health check returned an unexpected body: ${body}"
    exit 1
    ;;
esac

# --- 2. Is the connection pool saturated? -------------------------------------
# Only alerts on two consecutive scrapes: a momentarily busy pool is normal, a
# persistently queued one is the deadlock signature. Absent metric (older build,
# or /metrics not reachable from here) is skipped rather than treated as a fault.
waiting=$(curl -fsS -m "$TIMEOUT" "$API_METRICS_URL" 2>/dev/null \
  | awk '/^albionmapper_db_pool_waiting /{print $2; exit}')

if [ -n "$waiting" ] && [ "${waiting%.*}" -gt 0 ] 2>/dev/null; then
  if [ -f "$SATURATION_STATE" ]; then
    report "/fail" "Connection pool has been saturated across two consecutive checks (${waiting} queries queued). Suspect a stranded transaction — see docs/database.md."
    exit 1
  fi
  touch "$SATURATION_STATE"
  echo "pool saturated (${waiting} waiting) — will alert if still saturated next run"
else
  rm -f "$SATURATION_STATE"
fi

report "" "$body"
