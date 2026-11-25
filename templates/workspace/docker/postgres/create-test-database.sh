#!/usr/bin/env bash
# Creates <POSTGRES_DB>_test next to the development database, for the integration tests. The
# Postgres image runs this once, on an empty data volume, as POSTGRES_USER, over its Unix socket.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v name="${POSTGRES_DB}_test" <<-'EOSQL'
	CREATE DATABASE :"name";
EOSQL
