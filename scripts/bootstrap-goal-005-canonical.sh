#!/usr/bin/env bash
set -euo pipefail

# Bootstrap an isolated, empty database from the GOAL-005 baseline.
# This script is deliberately unusable unless the operator explicitly marks
# the target as isolated. It must never be used against production.

if [[ "${1:-}" == "--plan-only" ]]; then
  exec node scripts/plan-goal-005-canonical-bootstrap.mjs
fi

if [[ "${GOAL5_BOOTSTRAP_TARGET:-}" != "isolated" ]]; then
  echo "Refusing bootstrap: set GOAL5_BOOTSTRAP_TARGET=isolated for a disposable non-production database." >&2
  exit 2
fi

database_url_env="${GOAL5_BOOTSTRAP_DATABASE_URL_ENV:-CANONICAL_DATABASE_URL}"
database_url="${!database_url_env:-}"
if [[ -z "$database_url" ]]; then
  echo "Refusing bootstrap: the database URL environment variable is absent." >&2
  exit 2
fi

for command in node psql supabase; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }
done

plan_file="$(mktemp)"
dry_run_file="$(mktemp)"
trap 'rm -f "$plan_file" "$dry_run_file"' EXIT
node scripts/plan-goal-005-canonical-bootstrap.mjs >"$plan_file"

# The caller is responsible for providing a new empty database. The baseline
# contains schema only; it is never directed at production by this script.
public_table_count="$(psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_catalog.pg_tables where schemaname = 'public';")"
if [[ "$public_table_count" != "0" ]]; then
  echo "Refusing bootstrap: target has public tables and is not an empty isolated database." >&2
  exit 2
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f supabase/baselines/20260712-production-public-schema.sql

# Supabase CLI 2.67 accepts one repaired version per invocation. The plan has
# already validated the immutable 97-version set before emitting this loop.
node -e "const p=require(process.argv[1]); for (const v of p.historyVersions) console.log(v)" "$plan_file" |
  while IFS= read -r version; do
    supabase migration repair --db-url "$database_url" --status applied "$version" --yes
  done

supabase db push --db-url "$database_url" --dry-run >"$dry_run_file"
mapfile -t proposed < <(grep -oE '20[0-9]{12}_[a-z0-9_]+\.sql' "$dry_run_file" | sort -u)
if [[ "${#proposed[@]}" -ne 1 || "${proposed[0]:-}" != "20260712120000_secure_claim_review_analyze_jobs.sql" ]]; then
  echo "Refusing bootstrap: dry-run did not isolate GOAL-003 as the sole prospective migration." >&2
  exit 1
fi

supabase db push --db-url "$database_url" --yes
echo "Canonical bootstrap complete: 97 baseline ledger versions plus GOAL-003 only."
