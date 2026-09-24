#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env exists; credentials preserved."; exit 0; fi
umask 077
{
 printf 'DB_PASSWORD=%s\n' "$(openssl rand -hex 32)"
 printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)"
 printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 16)"
 printf 'APP_ORIGIN=http://localhost:3000\nBACKUP_RETENTION_DAYS=14\n'
} > .env
echo "Created .env. User: admin. Read ADMIN_PASSWORD locally. Run: docker compose up --build -d"
