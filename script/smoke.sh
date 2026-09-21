#!/usr/bin/env bash
# Post-deploy smoke test. Usage: ./script/smoke.sh https://thescore.example.com
#
# Read-only except for the optional track creation at the end, which is skipped
# unless CREATE=1 — no accidental API credits burned on a smoke test.
set -uo pipefail

BASE="${1:-}"
[ -z "$BASE" ] && { echo "usage: $0 <base-url>"; exit 2; }
BASE="${BASE%/}"

pass=0; fail=0
check() { # name expected_code url [extra curl args...]
  local name="$1" want="$2" url="$3"; shift 3
  local code
  code=$(curl -s -o /tmp/smoke.out -w '%{http_code}' -m 20 "$@" "$url")
  if [ "$code" = "$want" ]; then
    printf '  ok    %-34s %s\n' "$name" "$code"; pass=$((pass+1))
  else
    printf '  FAIL  %-34s got %s want %s\n' "$name" "$code" "$want"; fail=$((fail+1))
  fi
}

echo "Smoke testing $BASE"
echo
echo "Health"
check "health responds"            200 "$BASE/api/health"
python3 -c "
import json,sys
try: d=json.load(open('/tmp/smoke.out'))
except Exception: print('  (health body was not JSON)'); sys.exit()
print(f\"  db      : {d.get('db')}\")
print(f\"  storage : {d.get('storage')}\")
print(f\"  uptime  : {d.get('uptimeSec')}s\")
if d.get('storage') == 'not configured':
    print('  NOTE: S3 is not switched on — audio still proxies from the provider.')
elif d.get('storage') != 'ok':
    print('  WARN: bucket is configured but unreachable. Check the IAM policy first.')
"

echo
echo "Surfaces"
check "kiosk shell"                200 "$BASE/"
check "presets"                    200 "$BASE/api/presets"
check "ops queue"                  200 "$BASE/api/ops/tracks"
check "ops storage"                200 "$BASE/api/ops/storage"
check "api credits"                200 "$BASE/api/ops/credits"

echo
echo "Behaviour"
check "unknown claim code is 404"  404 "$BASE/api/tracks/ZZZZZZ"

# Byte ranges are the load-bearing one: mobile Safari refuses audio sources that
# cannot serve partial content, so this failing means every iPhone fails.
CODE=$(curl -s -m 20 "$BASE/api/ops/tracks" \
  | python3 -c "
import json,sys
try: ts=json.load(sys.stdin).get('tracks',[])
except Exception: ts=[]
r=[t for t in ts if t.get('status')=='ready']
print(r[0]['claimCode'] if r else '')" 2>/dev/null)

if [ -n "$CODE" ]; then
  check "audio serves byte range ($CODE)" 206 "$BASE/api/tracks/$CODE/audio" -r 0-1023
else
  echo "  skip  no ready track yet — make one, then re-run for the range check"
fi

echo
if [ -n "${CREATE:-}" ]; then
  echo "Creating a real track (burns API credits)"
  curl -s -m 30 -X POST "$BASE/api/tracks" \
    -H 'content-type: application/json' \
    -d '{"preset":"moonshot","vibe":"Cybernetic","angle":"Cosmos"}' | head -c 400
  echo
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
