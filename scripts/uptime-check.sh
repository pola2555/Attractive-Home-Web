#!/usr/bin/env bash
#
# Uptime / health check for the Attractive Home app. Intended to run as a cron
# on the box (every few minutes). It hits the app's health URL and:
#   - on failure: logs and (if ALERT_WEBHOOK_URL is set) POSTs a JSON alert
#     (Slack/Discord/generic incoming webhook shape: {"text": "..."}).
#   - on success: if HEALTHCHECK_PING_URL is set, pings it — a dead-man's-switch
#     (healthchecks.io / BetterStack style) so an EXTERNAL service alerts you if
#     the ping ever stops (this is what catches the whole box being down, which
#     an on-box check never can).
#
# NOTE: an on-box cron cannot tell you the box is unreachable from the internet
# — only an external monitor can. Pair this with a free external HTTP monitor
# (UptimeRobot / healthchecks.io / BetterStack) pointed at the public health URL.
#
# Config (env vars):
#   HEALTH_URL          default http://localhost:3000/en
#   ALERT_WEBHOOK_URL   optional — incoming webhook to POST {"text": "..."} on failure
#   HEALTHCHECK_PING_URL optional — URL to GET on success (dead-man's switch)
#   TIMEOUT             optional — curl timeout seconds, default 10
#
# Cron example (/etc/cron.d/attractive-home-uptime), every 3 minutes:
#   */3 * * * * ubuntu HEALTH_URL=http://localhost:3000/en ALERT_WEBHOOK_URL=https://hooks.slack.com/... /home/ubuntu/app/scripts/uptime-check.sh >> /var/log/ah-uptime.log 2>&1

set -uo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/en}"
TIMEOUT="${TIMEOUT:-10}"
now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$HEALTH_URL" || echo "000")"

if [ "$code" = "200" ]; then
  echo "$(now) OK $HEALTH_URL -> 200"
  if [ -n "${HEALTHCHECK_PING_URL:-}" ]; then
    curl -fsS --max-time "$TIMEOUT" "$HEALTHCHECK_PING_URL" >/dev/null 2>&1 \
      && echo "$(now) pinged dead-man's-switch" \
      || echo "$(now) WARN dead-man's-switch ping failed"
  fi
  exit 0
fi

msg="Attractive Home health check FAILED: $HEALTH_URL returned HTTP $code at $(now)"
echo "$(now) DOWN $HEALTH_URL -> $code"

if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  curl -fsS --max-time "$TIMEOUT" -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": \"$msg\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 \
    && echo "$(now) alert sent" \
    || echo "$(now) WARN alert webhook POST failed"
fi

exit 1
