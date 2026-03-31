#!/bin/sh
set -eu

node scripts/init-db.js
exec node src/server.js
