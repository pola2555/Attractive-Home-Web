#!/usr/bin/env bash
#
# One-time: adopt Prisma migrations on a database that was built with `db push`
# and therefore has no `_prisma_migrations` history. Marks every existing
# migration as already-applied so that future `prisma migrate deploy` applies
# only genuinely new migrations instead of trying to re-create objects that are
# already there.
#
# SAFE: `migrate resolve --applied` only writes the `_prisma_migrations` table;
# it never runs migration SQL and never touches your data. Idempotent — a
# migration already recorded as applied is reported and skipped.
#
# Preconditions: the DB schema already matches the migrations (true for this
# project — all hand-added SQL is captured in the migration files). Run with
# DATABASE_URL pointing at the DB you want to baseline (dev is already done; this
# is for the box). Verify with the final `migrate status` line.
#
#   DATABASE_URL=postgresql://... scripts/baseline-migrations.sh

set -uo pipefail

SCHEMA="prisma/schema"
: "${DATABASE_URL:?set DATABASE_URL to the database to baseline}"

echo "Baselining migrations against: ${DATABASE_URL%%\?*}"
for m in $(ls -1 "$SCHEMA/migrations/" | grep -E '^[0-9]' | sort); do
  if npx prisma migrate resolve --applied "$m" --schema "$SCHEMA" >/dev/null 2>&1; then
    echo "  applied:  $m"
  else
    echo "  skipped:  $m (already recorded, or resolve failed — see status below)"
  fi
done

echo
npx prisma migrate status --schema "$SCHEMA"
