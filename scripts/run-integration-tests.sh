#!/usr/bin/env bash
#
# Runs the integration suite against the local Supabase stack.
#
# The keys are read from `supabase status` rather than a checked-in file: they
# are local-only development keys, and nothing resembling a production
# service-role key should ever live in the repository.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! npx supabase status >/dev/null 2>&1; then
  echo "Local Supabase is not running. Start it with: npm run supabase:start" >&2
  exit 1
fi

eval "$(npx supabase status -o env | sed 's/^/export LOCAL_/')"

export SUPABASE_URL="${LOCAL_API_URL}"
export SUPABASE_ANON_KEY="${LOCAL_ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${LOCAL_SERVICE_ROLE_KEY}"

exec npx vitest run --config vitest.integration.config.ts "$@"
