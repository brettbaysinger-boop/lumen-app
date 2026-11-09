#!/usr/bin/env bash
# Offline check of supabase/rmc/memory_store_guard.sql on a throwaway local
# PostgreSQL cluster with a fictional stand-in schema. Touches no Lumen data.
# Usage: scripts/test-rmc-memory-guard-sql.sh [/usr/lib/postgresql/16/bin]
set -euo pipefail
B=${1:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
G=$(cd "$(dirname "$0")/.." && pwd)/supabase/rmc/memory_store_guard.sql
D=$(mktemp -d); PORT=$((55000 + RANDOM % 1000))
as_pg() { if [[ $(id -u) == 0 ]]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[[ $(id -u) == 0 ]] && chown postgres "$D"
as_pg "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-k $D -p $PORT -c listen_addresses=' -l $D/log -w start >/dev/null"
trap 'as_pg "$B/pg_ctl -D $D/data stop -m fast >/dev/null" || true; rm -rf "$D"' EXIT
P="psql -X -q -h $D -p $PORT -U postgres -v ON_ERROR_STOP=1"
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
$P >/dev/null <<'SQL'
CREATE ROLE authenticated; CREATE ROLE anon;
CREATE TABLE public.memories(id serial PRIMARY KEY, content text, is_active bool DEFAULT true);
CREATE TABLE public.memory_suggestions(id serial PRIMARY KEY, content text);
CREATE TABLE public.memory_revisions(id serial PRIMARY KEY, memory_id int);
GRANT ALL ON public.memories, public.memory_suggestions, public.memory_revisions TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
CREATE FUNCTION public.review() RETURNS void LANGUAGE sql SECURITY DEFINER
  AS 'INSERT INTO public.memories(content) VALUES (''fictional via rpc'')';
GRANT EXECUTE ON FUNCTION public.review() TO authenticated;
INSERT INTO public.memories(content) VALUES ('fictional existing');
SQL
$P -f "$G" >/dev/null && $P -f "$G" >/dev/null && ok "applies twice (idempotent)"
as_auth() { $P -c "SET ROLE authenticated; $1" >/dev/null 2>&1; }
as_auth "INSERT INTO memories(content) VALUES ('a'); UPDATE memories SET is_active=false WHERE content='a'; DELETE FROM memories WHERE content='a'; SELECT public.review();" \
  && ok "supabase mode: writes and RPC unchanged" || bad "supabase mode blocked writes"
$P -c "UPDATE public.lumen_memory_store SET backend='rmc', changed_at=now()" >/dev/null
for q in "INSERT INTO memories(content) VALUES ('b')" "UPDATE memories SET is_active=false" "DELETE FROM memories" \
         "INSERT INTO memory_suggestions(content) VALUES ('s')" "INSERT INTO memory_revisions(memory_id) VALUES (1)" \
         "SELECT public.review()" "UPDATE lumen_memory_store SET backend='supabase'" "DELETE FROM lumen_memory_store" \
         "SELECT * FROM lumen_memory_store"; do
  as_auth "$q" && bad "rmc mode allowed: $q" || ok "rmc mode refused: $q"
done
[[ $($P -At -c "SET ROLE authenticated; SELECT count(*) FROM memories") == 2 ]] && ok "rmc mode: reads work, rows kept" || bad "rows changed"
$P -c "UPDATE public.lumen_memory_store SET backend='supabase'" >/dev/null
as_auth "INSERT INTO memories(content) VALUES ('c')" && ok "rollback: writes allowed again" || bad "rollback still blocked"
exit $fail
