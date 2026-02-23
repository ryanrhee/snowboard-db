#!/bin/bash
# Usage: ./debug.sh '{"action":"scrape-specs"}'
kill $(lsof -i :3099 -t) 2>/dev/null
# Wait for server to go down
sleep 1
while curl -s -o /dev/null http://localhost:3099/ 2>/dev/null; do sleep 0.5; done
# Wait for server to come back up (probe with GET /, not the debug endpoint)
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/ 2>/dev/null | grep -q 200; then break; fi
done
sleep 1
BODY="${1:-'{}'}"
echo "$BODY" | curl -s http://localhost:3099/api/debug -X POST -H 'Content-Type: application/json' -d @- | python3 -m json.tool
