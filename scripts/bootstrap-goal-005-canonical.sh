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
ledger_file="$(mktemp)"
trap 'rm -f "$plan_file" "$dry_run_file" "$ledger_file"' EXIT
node scripts/plan-goal-005-canonical-bootstrap.mjs >"$plan_file"

if [[ "$database_url" == *"fhadiwkdznhuxtlgrwfd"* ]]; then
  echo "Refusing bootstrap: production project reference detected in database URL." >&2
  exit 2
fi
database_host="$(GOAL5_DATABASE_URL="$database_url" node -e 'try { console.log(new URL(process.env.GOAL5_DATABASE_URL).hostname) } catch { process.exit(2) }')" || {
  echo "Refusing bootstrap: invalid database URL." >&2
  exit 2
}
case "$database_host" in
  localhost|127.0.0.1|::1|"[::1]"|*.localhost) ;;
  *)
    echo "Refusing bootstrap: canonical bootstrap is restricted to a loopback database." >&2
    exit 2
    ;;
esac

# The caller is responsible for providing a new empty database. The baseline
# contains schema only; it is never directed at production by this script.
public_table_count="$(psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_catalog.pg_tables where schemaname = 'public';")"
if [[ "$public_table_count" != "0" ]]; then
  echo "Refusing bootstrap: target has public tables and is not an empty isolated database." >&2
  exit 2
fi
ledger_table_count="$(psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_catalog.pg_tables where schemaname = 'supabase_migrations' and tablename = 'schema_migrations';")"
if [[ "$ledger_table_count" != "0" ]]; then
  ledger_entry_count="$(psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from supabase_migrations.schema_migrations;")"
  if [[ "$ledger_entry_count" != "0" ]]; then
    echo "Refusing bootstrap: target migration ledger is not empty." >&2
    exit 2
  fi
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f supabase/baselines/20260712-production-public-schema.sql

# Supabase CLI 2.67 accepts one repaired version per invocation. The plan has
# already validated the immutable 97-version set before emitting this loop.
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); for (const v of p.baselineLedgerVersions) console.log(v)' "$plan_file" |
  while IFS= read -r version; do
    supabase migration repair --db-url "$database_url" --status applied "$version" --yes
  done

supabase db push --db-url "$database_url" --dry-run >"$dry_run_file" 2>&1
node scripts/validate-goal-005-dry-run.mjs "$plan_file" "$dry_run_file"

supabase db push --db-url "$database_url" --yes
psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select version from supabase_migrations.schema_migrations order by version;" >"$ledger_file"
node -e '
  const fs = require("fs");
  const plan = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const actual = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean);
  const prospective = plan.prospectiveMigrations.map((file) => file.slice(0, 14));
  const expected = [...plan.baselineLedgerVersions, ...prospective].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error("Refusing completion: resulting migration ledger differs from canonical plan.");
    process.exit(1);
  }
' "$plan_file" "$ledger_file"
echo "Canonical bootstrap complete: baseline ledger plus canonical prospective migrations."
