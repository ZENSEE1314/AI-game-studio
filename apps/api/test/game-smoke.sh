#!/usr/bin/env bash
# E2E for in-game credits and rounds. Usage: API=... ADMIN_PASSWORD=... [PSQL_URL=...] ./test/game-smoke.sh
set -u
API=${API:-http://localhost:3000/api/v1}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; fail=0; P=LongPassword123
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
login() { call POST /auth/login "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'o.accessToken'; }
mk() { call POST /accounts "{\"role\":\"$1\",\"parentId\":\"$2\",\"username\":\"$3\",\"email\":\"$3@t.io\",\"password\":\"$P\",\"fullName\":\"$3\"}" | j 'o.id'; }

ADMIN=$(login superadmin "$PW"); TOKEN=$ADMIN; SA=$(call GET /auth/me | j 'o.id')
AG=$(mk AGENCY $SA gag$R); AT=$(mk AGENT $AG gat$R); ST=$(mk STAFF $AT gst$R)
U1=$(mk USER $ST gu1$R); U2=$(mk USER $ST gu2$R); U3=$(mk USER $ST gu3$R)
T1=$(login gu1$R $P); T2=$(login gu2$R $P); T3=$(login gu3$R $P); TST=$(login gst$R $P)

# ---- credits
check "grant credits" "$(call POST /wallet/grant "{\"userId\":\"$U1\",\"amount\":100000,\"idempotencyKey\":\"k1-$R-aaaa\"}" | j 'o.balanceAfter')" 100000
check "grant is idempotent (same key)" "$(call POST /wallet/grant "{\"userId\":\"$U1\",\"amount\":100000,\"idempotencyKey\":\"k1-$R-aaaa\"}" | j 'o.duplicate')" true
TOKEN=$T1; check "balance not doubled" "$(call GET /wallet/me | j 'o.available')" 100000
check "player cannot grant themselves credits" "$(code POST /wallet/grant "{\"userId\":\"$U1\",\"amount\":5}")" 403
TOKEN=$TST; check "staff cannot grant credits" "$(code POST /wallet/grant "{\"userId\":\"$U1\",\"amount\":5}")" 403
TOKEN=$ADMIN
check "negative grant rejected" "$(code POST /wallet/grant "{\"userId\":\"$U1\",\"amount\":-5}")" 400
check "cannot grant to super admin" "$(code POST /wallet/grant "{\"userId\":\"$SA\",\"amount\":50}")" 400
call POST /wallet/grant "{\"userId\":\"$U2\",\"amount\":50000}" >/dev/null; call POST /wallet/grant "{\"userId\":\"$U3\",\"amount\":30000}" >/dev/null

# ---- round lifecycle
RD=$(call POST /game/rounds "{\"name\":\"Round $R\",\"minStake\":10000}" | j 'o.id'); check "round created in DRAFT" "$(call GET /game/rounds/$RD | j 'o.status')" DRAFT
TOKEN=$T1; check "players cannot see drafts" "$(code GET /game/rounds/$RD)" 404
check "cannot pick in draft" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":10000}]}')" 404
TOKEN=$ADMIN; check "players cannot create rounds (admin only)" "$(TOKEN=$T1 code POST /game/rounds '{"name":"hack"}')" 403
check "open round" "$(call POST /game/rounds/$RD/open | j 'o.status')" OPEN
check "cannot open twice" "$(code POST /game/rounds/$RD/open)" 409

TOKEN=$T1
check "pick below minimum rejected" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":9999}]}')" 400
check "number 28 rejected" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":28,"stake":10000}]}')" 400
check "duplicate number rejected" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":10000},{"number":3,"stake":10000}]}')" 400
check "over-balance rejected" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":100001}]}')" 409
check "submit picks (3 and 7)" "$(call POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":40000},{"number":7,"stake":20000}]}' | j 'o.held')" 60000
check "credits held, none lost" "$(call GET /wallet/me | j '[o.available,o.held,o.total].join(",")')" "40000,60000,100000"
check "edit picks before lock (only 7)" "$(call POST /game/rounds/$RD/selections '{"picks":[{"number":7,"stake":30000}]}' | j 'o.held')" 30000
check "hold follows the edit" "$(call GET /wallet/me | j '[o.available,o.held].join(",")')" "70000,30000"
TOKEN=$T2; call POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":50000}]}' >/dev/null
TOKEN=$T3; call POST /game/rounds/$RD/selections '{"picks":[{"number":3,"stake":10000},{"number":9,"stake":10000}]}' >/dev/null
TOKEN=$T1; check "player sees only own picks" "$(call GET /game/rounds/$RD | j 'o.mine.length')" 1
check "player view hides others' stats" "$(call GET /game/rounds/$RD | j 'o.byNumber===undefined')" true

# ---- concurrency: 6 simultaneous submissions that cannot all fit
TOKEN=$T3; BAL=$(call GET /wallet/me | j 'o.available'); echo "u3 available before race: $BAL"
for i in 1 2 3 4 5 6; do ( code POST /game/rounds/$RD/selections "{\"picks\":[{\"number\":$((10+i)),\"stake\":25000}]}" > /tmp/race.$R.$i ) & done; wait
OKS=$(cat /tmp/race.$R.* | grep -o "20[01]" | wc -l); rm -f /tmp/race.$R.*
check "all race requests answered 2xx (each replaces previous)" "$OKS" 6
check "race left consistent wallet (total unchanged)" "$(call GET /wallet/me | j '[o.available,o.held,o.total].join(",")')" "5000,25000,30000"
check "exactly one pick survives the race" "$(call GET /game/rounds/$RD | j 'o.mine.length')" 1

# ---- lock
TOKEN=$ADMIN; check "lock round" "$(call POST /game/rounds/$RD/lock | j 'o.status')" LOCKED
TOKEN=$T1; check "no picks after lock" "$(code POST /game/rounds/$RD/selections '{"picks":[{"number":1,"stake":10000}]}')" 409
TOKEN=$ADMIN
check "publish refused before result" "$(code POST /game/rounds/$RD/publish)" 409
check "result 0 rejected" "$(code POST /game/rounds/$RD/result '{"number":0}')" 400
check "result 28 rejected" "$(code POST /game/rounds/$RD/result '{"number":28}')" 400
check "enter result 3 (pending)" "$(call POST /game/rounds/$RD/result '{"number":3}' | j 'o.status')" RESULT_PENDING
check "admin preview lists winners before publishing" "$(call GET /game/rounds/$RD | j 'o.previewWinners.map(w=>w.username).sort().join(",")')" "gu2$R"
TOKEN=$T2; check "players cannot see the pending number" "$(call GET /game/rounds/$RD | j 'o.pendingNumber')" null
TOKEN=$ADMIN; check "result can be corrected before publishing" "$(call POST /game/rounds/$RD/result '{"number":7}' | j 'o.pendingNumber')" 7
check "publish result 7" "$(call POST /game/rounds/$RD/publish | j 'o.status')" COMPLETED
check "winner is gu1 only" "$(call GET /game/rounds/$RD | j 'o.winners.map(w=>w.username).join(",")')" "gu1$R"
check "cannot publish twice" "$(code POST /game/rounds/$RD/publish)" 409
check "cannot change published result" "$(code POST /game/rounds/$RD/result '{"number":9}')" 409
check "cannot cancel completed round" "$(code POST /game/rounds/$RD/cancel)" 409
TOKEN=$T1; check "all holds released after publish" "$(call GET /wallet/me | j '[o.available,o.held,o.total].join(",")')" "100000,0,100000"
TOKEN=$T2; check "loser keeps every credit" "$(call GET /wallet/me | j '[o.available,o.held].join(",")')" "50000,0"
TOKEN=$T1; check "winner sees published result" "$(call GET /game/rounds/$RD | j 'o.result.number')" 7
check "history marks win" "$(call GET /game/me/history | j 'o.find(h=>h.number===7).won')" true
check "leaderboard ranks winner first" "$(call GET /game/leaderboard | j 'o.find(x=>x.username==="gu1'$R'").wins>=1')" true
check "ledger has grant/hold/release trail" "$(call GET '/wallet/me/ledger?limit=100' | j '[...new Set(o.items.map(i=>i.kind))].sort().join(",")')" "GRANT,HOLD,RELEASE"

# ---- cancel path releases holds
TOKEN=$ADMIN; RC=$(call POST /game/rounds "{\"name\":\"Cancel $R\"}" | j 'o.id'); call POST /game/rounds/$RC/open >/dev/null
TOKEN=$T2; call POST /game/rounds/$RC/selections '{"picks":[{"number":2,"stake":20000}]}' >/dev/null
check "hold placed in second round" "$(call GET /wallet/me | j 'o.held')" 20000
TOKEN=$ADMIN; check "cancel round" "$(call POST /game/rounds/$RC/cancel | j 'o.status')" CANCELLED
TOKEN=$T2; check "cancel released hold" "$(call GET /wallet/me | j '[o.available,o.held].join(",")')" "50000,0"

# ---- maintenance + roles
TOKEN=$ADMIN; call PUT /system/status '{"status":"MAINTENANCE"}' >/dev/null
TOKEN=$T1; check "players blocked during maintenance" "$(code GET /game/rounds)" 403
TOKEN=$ADMIN; call PUT /system/status '{"status":"ACTIVE"}' >/dev/null
check "super admin cannot play" "$(code POST /game/rounds/$RD/selections '{"picks":[]}')" 403
TOKEN=$ADMIN; check "admin balances list" "$(call GET "/wallet/balances?search=gu1$R" | j 'o.items[0].available')" 100000
check "no payment endpoints exist (deposit)" "$(code POST /wallet/deposit '{}')" 404
check "no payment endpoints exist (withdraw)" "$(code POST /wallet/withdraw '{}')" 404
check "no transfer endpoint exists" "$(code POST /wallet/transfer '{}')" 404

if [ -n "${PSQL_URL:-}" ]; then
  chk() { psql "$PSQL_URL" -qtAc "$2" 2>&1 | grep -q "$3" && echo "PASS $1" || { echo "FAIL $1"; fail=1; }; }
  chk "DB: negative balance impossible" "UPDATE wallets SET balance=-1 WHERE user_id='$U1'" "wallet_nonneg"
  chk "DB: ledger is append-only" "DELETE FROM wallet_ledger" "append-only"
  chk "DB: published result immutable" "UPDATE round_results SET number=9 WHERE round_id='$RD'" "append-only"
  chk "DB: completed round is final" "UPDATE game_rounds SET status='OPEN' WHERE id='$RD'" "final"
  chk "DB: no picks on a completed round" "INSERT INTO number_selections(id,round_id,user_id,number,stake) VALUES (gen_random_uuid(),'$RD','$U1',1,10000)" "OPEN"
  check "DB: 1-27 constraint present" "$(psql "$PSQL_URL" -qtAc "SELECT count(*) FROM pg_constraint WHERE conname='selection_number_range'")" 1
  chk "DB: picks cannot be altered" "UPDATE number_selections SET stake=1 WHERE round_id='$RD'" "immutable"
  chk "DB: rounds cannot be deleted" "DELETE FROM game_rounds WHERE id='$RD'" "cannot be deleted"
  # conservation: for every wallet, grants - (holds - releases) = balance; held = holds - releases
  BAD=$(psql "$PSQL_URL" -qtAc "SELECT count(*) FROM wallets w WHERE w.balance <> COALESCE((SELECT SUM(CASE kind WHEN 'GRANT' THEN amount WHEN 'RELEASE' THEN amount WHEN 'HOLD' THEN -amount END) FROM wallet_ledger WHERE wallet_id=w.id),0) OR w.held <> COALESCE((SELECT SUM(CASE kind WHEN 'HOLD' THEN amount WHEN 'RELEASE' THEN -amount ELSE 0 END) FROM wallet_ledger WHERE wallet_id=w.id),0)")
  check "ledger reconciles to every wallet balance" "$BAD" 0
fi
exit $fail
