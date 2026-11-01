#!/usr/bin/env bash
#
# Nightly PostgreSQL backup → S3, with local retention.
#
# Runs on the box (or anywhere with psql client tools + AWS CLI). Takes a
# compressed custom-format dump (pg_dump -Fc, the format `pg_restore` wants),
# uploads it to S3, and prunes old local copies. Designed for cron:
#
#   # /etc/cron.d/attractive-home-backup  (runs 02:17 Asia/Dubai daily)
#   17 2 * * *  deploy  BACKUP_S3_BUCKET=attractive.home.ae /opt/attractive-home/scripts/backup-db.sh >> /var/log/ah-backup.log 2>&1
#
# Restore (see docs/OPERATIONS.md for the full runbook):
#   pg_restore --clean --if-exists -d "$DATABASE_URL" ah-YYYYMMDD-HHMMSS.dump
#
# Configuration (env vars):
#   DATABASE_URL       required — the Postgres connection string to dump.
#   BACKUP_S3_BUCKET   required — target bucket (no s3:// prefix), e.g. attractive.home.ae
#   BACKUP_S3_PREFIX   optional — key prefix (default: db-backups).
#   BACKUP_DIR         optional — local staging dir (default: /var/backups/attractive-home).
#   BACKUP_KEEP_LOCAL  optional — how many local dumps to keep (default: 7).
#   AWS credentials come from the standard chain — on the box use the EC2
#   instance role (NO personal keys on the box).

set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET}"
PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
DIR="${BACKUP_DIR:-/var/backups/attractive-home}"
KEEP="${BACKUP_KEEP_LOCAL:-7}"

mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/ah-$STAMP.dump"

echo "[$(date -Is)] dumping to $FILE"
# -Fc custom format, compressed; --no-owner/--no-acl so the dump restores into
# any role (the box's DB role differs from a developer's local one).
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date -Is)] dump ok ($SIZE); uploading to s3://$BACKUP_S3_BUCKET/$PREFIX/"
aws s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/$PREFIX/ah-$STAMP.dump"

echo "[$(date -Is)] pruning local dumps, keeping newest $KEEP"
ls -1t "$DIR"/ah-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f

echo "[$(date -Is)] backup complete: ah-$STAMP.dump"
