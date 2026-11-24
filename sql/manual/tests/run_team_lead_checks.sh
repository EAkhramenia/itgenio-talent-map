#!/usr/bin/env bash
# Отдельная временная PostgreSQL: базовая схема, этапы 1 и 2, повторные запуски и проверки прав.
# Рабочую базу не трогает. Использование: bash sql/manual/tests/run_company_checks.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); D=$(mktemp -d /tmp/people-testdb.XXXX); PORT=${PORT:-55432}
AS=""; if [ "$(id -u)" = 0 ]; then chown "${PG_OS_USER:-postgres}" "$D"; chmod 755 "$D"; U=$(id -u "${PG_OS_USER:-postgres}"); AS="setpriv --reuid=$U --regid=$(id -g "${PG_OS_USER:-postgres}") --clear-groups"; fi
$AS initdb -D "$D" -U postgres >/dev/null
PG_TEST_CONNECTION="$D"; PG_TEST_ARGS="-p $PORT -k $D -c listen_addresses=''"
if [ "${PG_TEST_TCP:-0}" = 1 ]; then PG_TEST_CONNECTION=127.0.0.1; PG_TEST_ARGS="-p $PORT -k '' -c listen_addresses=127.0.0.1"; fi
$AS pg_ctl -D "$D" -o "$PG_TEST_ARGS" -l "$D/log" start >/dev/null
trap '$AS pg_ctl -D "$D" stop -m fast >/dev/null; rm -rf "$D"' EXIT
P="psql -h $PG_TEST_CONNECTION -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$P -d postgres -c "CREATE DATABASE people_test"; P="$P -d people_test"
$P -f "$ROOT/sql/manual/tests/stub_supabase.sql"
for f in "$ROOT"/drizzle/migrations/0*.sql; do PGOPTIONS="-c client_min_messages=warning" $P -f "$f"; done
PGOPTIONS="-c client_min_messages=warning" $P -f "$ROOT/sql/manual/2026-11-18_stage1_org_employees.sql"
M="$ROOT/sql/manual/2026-11-23_employee_team_lead.sql"
PGOPTIONS="-c client_min_messages=warning" $P -f "$M"
PGOPTIONS="-c client_min_messages=warning" $P -f "$M"
$P -tA -o /dev/null -f "$ROOT/sql/manual/tests/team_lead_checks.sql"
PGOPTIONS="-c client_min_messages=warning" $P -f "$M"
[ "$($P -tAc "SELECT team_lead_employee_id FROM public.employees WHERE id='e0000000-0000-0000-0000-000000000001'")" = e0000000-0000-0000-0000-000000000003 ]
echo 'TEAM LEAD CHECKS PASSED'
