#!/usr/bin/env bash
# Seed 7 team members into all 4 workspaces on the shared Twenty instance.
#
#   ./run.sh            -> DRY RUN (runs inside a transaction, then ROLLBACK; nothing persists)
#   ./run.sh --commit   -> APPLY for real
#   ./run.sh --verify   -> just show current members per workspace (read-only)
#
# Runs against the twenty-db-1 Docker container on this host (twenty-api).
set -euo pipefail

CONTAINER="twenty-db-1"
DB="default"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$DIR/seed-team-members.sql"
PSQL=(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB")

VERIFY_SQL=$'\\pset border 2\n'"
SELECT w.\"displayName\" AS workspace, count(uw.*) AS members
FROM core.workspace w
LEFT JOIN core.\"userWorkspace\" uw ON uw.\"workspaceId\" = w.id AND uw.\"deletedAt\" IS NULL
GROUP BY w.\"displayName\" ORDER BY 1;
SELECT email, \"firstName\", \"isEmailVerified\", (\"passwordHash\" IS NOT NULL) AS has_password
FROM core.\"user\" WHERE email LIKE '%@databayt.org' ORDER BY email;"

case "${1:-}" in
  --commit)
    echo ">> APPLYING seed to $CONTAINER/$DB ..."
    "${PSQL[@]}" -f - < "$SQL"
    echo ">> Post-apply verification:"; "${PSQL[@]}" -c "$VERIFY_SQL"
    ;;
  --verify)
    "${PSQL[@]}" -c "$VERIFY_SQL"
    ;;
  *)
    echo ">> DRY RUN (transaction will be ROLLED BACK; nothing persists)"
    { echo "BEGIN;"; cat "$SQL"; echo "ROLLBACK;"; } | "${PSQL[@]}" -f -
    echo ">> Dry run complete. Re-run with --commit to apply."
    ;;
esac
