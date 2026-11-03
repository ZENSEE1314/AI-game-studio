#!/usr/bin/env bash
# End-to-end smoke test against a running API with a seeded Super Admin.
# Usage: API=http://localhost:3055/api/v1 ADMIN_PASSWORD=... ./test/smoke.sh
set -u
API=${API:-http://localhost:3000/api/v1}; PW=${ADMIN_PASSWORD:?}
fail=0; R=$RANDOM
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
login() { call POST /auth/login "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'o.accessToken'; }
mk() { call POST /accounts "{\"role\":\"$1\",\"parentId\":\"$2\",\"username\":\"$3\",\"email\":\"$3@t.io\",\"password\":\"LongPassword123\",\"fullName\":\"$3\"}" | j 'o.id'; }

TOKEN=$(login superadmin "$PW"); [ -n "$TOKEN" ] && echo "PASS admin login" || { echo "FAIL admin login"; exit 1; }
SA=$(call GET /auth/me | j 'o.id')
AG=$(mk AGENCY "$SA" ag$R); AT=$(mk AGENT "$AG" at$R); ST=$(mk STAFF "$AT" st$R); US=$(mk USER "$ST" us$R)
AG2=$(mk AGENCY "$SA" agb$R)
check "chain created" "$([ -n "$AG$AT$ST$US" ] && echo y)" y
check "skip-level create rejected" "$(code POST /accounts "{\"role\":\"USER\",\"parentId\":\"$AT\",\"username\":\"x$R\",\"email\":\"x$R@t.io\",\"password\":\"LongPassword123\",\"fullName\":\"x\"}")" 400

TOKEN_AG=$(login ag$R LongPassword123); TOKEN=$TOKEN_AG
check "agency sees own user" "$(code GET /accounts/$US)" 200
check "agency cannot see other agency" "$(code GET /accounts/$AG2)" 404
check "agency cannot suspend" "$(code POST /accounts/$AT/suspend '{"reason":"nope nope"}')" 403
check "agency cannot read audit" "$(code GET /audit)" 403

TOKEN_US=$(login us$R LongPassword123); TOKEN=$TOKEN_US
check "user cannot list accounts" "$(code GET /accounts)" 403

TOKEN=$(login superadmin "$PW")
check "preview affected count" "$(call GET /accounts/$AG/suspension-preview | j 'o.affectedAccounts')" 3
call POST /accounts/$AG/suspend '{"reason":"policy review"}' >/dev/null
TOKEN=$TOKEN_US; check "descendant token dead immediately" "$(code GET /auth/me)" 401
check "descendant cannot login" "$(code POST /auth/login "{\"username\":\"us$R\",\"password\":\"LongPassword123\"}")" 403
TOKEN=$(login superadmin "$PW")
check "child reactivation blocked by suspended ancestor" "$(code POST /accounts/$US/reactivate '{"reason":"try reactivate"}')" 409
call POST /accounts/$AG/reactivate '{"reason":"cleared review"}' >/dev/null
check "login works after ancestor reactivated" "$([ -n "$(login us$R LongPassword123)" ] && echo y)" y

call PUT /system/status '{"status":"MAINTENANCE","message":"Back soon"}' >/dev/null
check "admin keeps access in maintenance" "$(code GET /accounts)" 200
check "user blocked in maintenance" "$(code POST /auth/login "{\"username\":\"us$R\",\"password\":\"LongPassword123\"}")" 403
check "status endpoint public" "$(TOKEN= code GET /system/status)" 200
call PUT /system/status '{"status":"ACTIVE"}' >/dev/null
check "audit trail written" "$(call GET '/audit?action=ACCOUNT_SUSPENDED' | j 'o.total>0')" true
exit $fail
