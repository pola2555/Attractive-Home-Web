#!/usr/bin/env bash
#
# Deploy the current commit to the EC2 test box via a git bundle over SSH, then
# migrate, build and restart the systemd service. Replaces the ad-hoc manual
# steps used so far (bundle → scp → git reset → build → restart).
#
# Usage:
#   DEPLOY_SSH_HOST=15.207.121.65 DEPLOY_SSH_KEY=~/.ssh/attractive-home.pem \
#     scripts/deploy.sh [git-ref]
#
# Configuration (env vars):
#   DEPLOY_SSH_HOST     required — box IP/hostname (ephemeral until an Elastic IP
#                       is allocated — Phase 5).
#   DEPLOY_SSH_KEY      required — path to the SSH private key.
#   DEPLOY_SSH_USER     optional — default: ubuntu.
#   DEPLOY_REMOTE_DIR   optional — default: /opt/attractive-home.
#   DEPLOY_SERVICE      optional — systemd unit, default: attractive-home.
#   DEPLOY_RUN_MIGRATIONS  optional — "1" (default) runs `prisma migrate deploy`
#                       on the box. The box DB must be BASELINED once before the
#                       first migrate-deploy (it was built via db push and has no
#                       _prisma_migrations history) — see docs/OPERATIONS.md
#                       "Adopting migrations". Set to "0" only until that is done.
#
# PREREQUISITE — the box security group must allow SSH from the deploying IP.
# The box SG is IP-allowlisted and the IP changes; open it first, e.g.:
#   aws ec2 authorize-security-group-ingress --group-id <sg-id> --protocol tcp \
#     --port 22 --cidr "$(curl -s https://checkip.amazonaws.com)/32"
# (needs AWS creds with EC2 perms; left manual on purpose — see OPERATIONS.md.)

set -euo pipefail

: "${DEPLOY_SSH_HOST:?set DEPLOY_SSH_HOST}"
: "${DEPLOY_SSH_KEY:?set DEPLOY_SSH_KEY}"
USER="${DEPLOY_SSH_USER:-ubuntu}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/attractive-home}"
SERVICE="${DEPLOY_SERVICE:-attractive-home}"
RUN_MIGRATIONS="${DEPLOY_RUN_MIGRATIONS:-1}"
REF="${1:-HEAD}"

SHA="$(git rev-parse --short "$REF")"
BUNDLE="/tmp/ah-deploy-$SHA.bundle"
SSH=(ssh -i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=accept-new "$USER@$DEPLOY_SSH_HOST")

echo "==> bundling $REF ($SHA)"
git bundle create "$BUNDLE" "$REF"

echo "==> copying bundle to $DEPLOY_SSH_HOST:$REMOTE_DIR"
scp -i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=accept-new "$BUNDLE" \
  "$USER@$DEPLOY_SSH_HOST:$REMOTE_DIR/incoming.bundle"

echo "==> applying on the box"
"${SSH[@]}" bash -se <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
git fetch incoming.bundle "$REF"
git reset --hard "$SHA"
rm -f incoming.bundle
npm install --no-audit --no-fund
npx prisma generate
if [ "$RUN_MIGRATIONS" = "1" ]; then npx prisma migrate deploy; fi
# Clear the Turbopack/Next cache before building: a .next cache left from the
# previous commit can make the new build fail to resolve internal modules
# (e.g. next/font/google). A clean build avoids that at a small time cost.
rm -rf .next
npm run build
sudo systemctl restart "$SERVICE"
REMOTE

echo "==> waiting for the service to answer"
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://$DEPLOY_SSH_HOST:3000/en" || true)"
  if [ "$code" = "200" ]; then echo "==> healthy (HTTP 200)"; break; fi
  sleep 2
done

rm -f "$BUNDLE"
echo "==> deployed $SHA"
