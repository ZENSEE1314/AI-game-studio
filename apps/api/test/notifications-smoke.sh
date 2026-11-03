#!/usr/bin/env bash
# Usage: API=... ADMIN_PASSWORD=... ./test/notifications-smoke.sh
set -u
API=${API:-http://localhost:3000/api/v1}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; fail=0; P=LongPassword123
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
login() { call POST /auth/login "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'o.accessToken'; }
mk() { call POST /accounts "{\"role\":\"$1\",\"parentId\":\"$2\",\"username\":\"$3\",\"email\":\"$3@t.io\",\"password\":\"$P\",\"fullName\":\"$3\"}" | j 'o.id'; }
unread() { call GET /notifications/unread-count | j 'o.unread'; }
ADMIN=$(login superadmin "$PW"); TOKEN=$ADMIN; SA=$(call GET /auth/me | j 'o.id')
AG=$(mk AGENCY $SA nag$R); AT=$(mk AGENT $AG nat$R); ST=$(mk STAFF $AT nst$R)
UA=$(mk USER $ST nua$R); UB=$(mk USER $ST nub$R); UC=$(mk USER $ST nuc$R)
TA=$(login nua$R $P); TB=$(login nub$R $P); TC=$(login nuc$R $P); TST=$(login nst$R $P)
for u in $UA $UB $UC; do call POST /wallet/grant "{\"userId\":\"$u\",\"amount\":50000}" >/dev/null; done
TOKEN=$TA; call POST /notifications/read-all >/dev/null; B0=$(unread); TOKEN=$ADMIN

RD=$(call POST /game/rounds "{\"name\":\"Notify $R\"}" | j 'o.id')
check "creating a draft notifies nobody" "$(TOKEN=$TA unread)" "$B0"
call POST /game/rounds/$RD/open >/dev/null
TOKEN=$TA; check "player notified when round opens" "$(unread)" $((B0 + 1))
LATEST=$(call GET '/notifications?limit=1'); check "notice type + deep link" "$(echo "$LATEST" | j 'o.items[0].type+":"+(o.items[0].data.roundId==="'$RD'")')" "ROUND_OPENED:true"
TOKEN=$TST; check "staff (also a player) notified" "$([ "$(call GET '/notifications?limit=1' | j 'o.items[0].type')" = ROUND_OPENED ] && echo y)" y
TOKEN=$ADMIN; check "super admin not notified of own action" "$(call GET /notifications | j 'o.items.filter(i=>i.data&&i.data.roundId==="'$RD'").length')" 0

TOKEN=$TA; call POST /game/rounds/$RD/selections '{"picks":[{"number":4,"stake":10000}]}' >/dev/null
TOKEN=$TB; call POST /game/rounds/$RD/selections '{"picks":[{"number":9,"stake":10000}]}' >/dev/null
TOKEN=$ADMIN; call POST /game/rounds/$RD/lock >/dev/null; call POST /game/rounds/$RD/result '{"number":4}' >/dev/null
TOKEN=$TA; BEFORE=$(unread); TOKEN=$ADMIN
check "result entry (preview) does not notify" "$(TOKEN=$TA unread)" "$BEFORE"
call POST /game/rounds/$RD/publish >/dev/null
TOKEN=$TA; check "winner notified" "$(call GET '/notifications?limit=1' | j 'o.items[0].title+"|"+o.items[0].data.won')" "You won! 🏆|true"
TOKEN=$TB; check "loser notified (credits returned)" "$(call GET '/notifications?limit=1' | j 'o.items[0].type+"|"+o.items[0].data.won+"|"+/returned/.test(o.items[0].body)')" "ROUND_RESULT|false|true"
TOKEN=$TC; check "non-participant gets no result notice" "$(call GET '/notifications?limit=50' | j 'o.items.filter(i=>i.type==="ROUND_RESULT").length')" 0

# read handling + isolation
TOKEN=$TA; NID=$(call GET '/notifications?limit=1' | j 'o.items[0].id'); U1=$(unread)
check "mark one read" "$(code POST /notifications/$NID/read)" 201
check "unread decreased by one" "$(unread)" $((U1 - 1))
check "marking read twice is harmless" "$(code POST /notifications/$NID/read)" 201
TOKEN=$TB; check "cannot read someone else's notification" "$(code POST /notifications/$NID/read)" 404
TOKEN=$TA; check "unread filter excludes read" "$(call GET '/notifications?unread=true&limit=100' | j 'o.items.every(i=>i.readAt===null)')" true
check "read-all clears badge" "$(call POST /notifications/read-all | j 'typeof o.marked')" number; check "unread now zero" "$(unread)" 0
TOKEN=; check "unauthenticated denied" "$(code GET /notifications)" 401

# cancel path
TOKEN=$ADMIN; RC=$(call POST /game/rounds "{\"name\":\"Cancel $R\"}" | j 'o.id'); call POST /game/rounds/$RC/open >/dev/null
TOKEN=$TB; call POST /game/rounds/$RC/selections '{"picks":[{"number":2,"stake":10000}]}' >/dev/null
TOKEN=$ADMIN; call POST /game/rounds/$RC/cancel >/dev/null
TOKEN=$TB; check "participant notified of cancellation" "$(call GET '/notifications?limit=1' | j 'o.items[0].type')" ROUND_CANCELLED
TOKEN=$TC; check "non-participant not told of cancel (only the open notice)" "$(call GET '/notifications?limit=50' | j 'o.items.filter(i=>i.type==="ROUND_CANCELLED").length')" 0

# suspended accounts are not notified
TOKEN=$ADMIN; call POST /accounts/$UC/suspend '{"reason":"test suspension"}' >/dev/null
RS=$(call POST /game/rounds "{\"name\":\"Susp $R\"}" | j 'o.id'); call POST /game/rounds/$RS/open >/dev/null
call POST /accounts/$UC/reactivate '{"reason":"test reactivate"}' >/dev/null
TOKEN=$(login nuc$R $P); check "suspended account skipped when round opened" "$(call GET '/notifications?limit=100' | j 'o.items.filter(i=>i.data&&i.data.roundId==="'$RS'").length')" 0
TOKEN=$ADMIN; call POST /game/rounds/$RS/cancel >/dev/null
exit $fail
