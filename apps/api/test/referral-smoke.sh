#!/usr/bin/env bash
# Referral sign-up + role change. Usage: API=... ADMIN_PASSWORD=... [PSQL_URL=...] ./test/referral-smoke.sh
set -u
API=${API:?}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; fail=0; P=LongPassword123
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
login() { call POST /auth/login "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'o.accessToken'; }
mk() { call POST /accounts "{\"role\":\"$1\",\"parentId\":\"$2\",\"username\":\"$3\",\"email\":\"$3@t.io\",\"password\":\"$P\",\"fullName\":\"$4\"}"; }
reg() { call POST /auth/register "{\"username\":\"$1\",\"email\":\"$1@t.io\",\"password\":\"$P\",\"fullName\":\"$1\",\"referralCode\":\"$2\"}"; }

ADMIN=$(login superadmin "$PW"); TOKEN=$ADMIN; SA=$(call GET /auth/me | j 'o.id')
AG=$(mk AGENCY $SA rag$R "Ref Agency" | j 'o.id'); AT=$(mk AGENT $AG rat$R "Ref Agent" | j 'o.id')
AG2=$(mk AGENCY $SA rag2$R "Other Agency" | j 'o.id'); AT2=$(mk AGENT $AG2 rat2$R "Other Agent" | j 'o.id')
S1J=$(mk STAFF $AT rs1$R "Sam Staff"); S1=$(echo "$S1J" | j 'o.id'); C1=$(echo "$S1J" | j 'o.referralCode')
S2J=$(mk STAFF $AT rs2$R "Sue Staff"); S2=$(echo "$S2J" | j 'o.id'); C2=$(echo "$S2J" | j 'o.referralCode')
S3J=$(mk STAFF $AT2 rs3$R "Other Staff"); S3=$(echo "$S3J" | j 'o.id'); C3=$(echo "$S3J" | j 'o.referralCode')
check "staff get an 8-char referral code" "$(echo "$C1" | grep -Ec '^[A-Z2-9]{8}$')" 1
check "codes are unique" "$([ "$C1" != "$C2" ] && [ "$C2" != "$C3" ] && echo y)" y
check "agents/agencies have no code" "$(call GET /accounts/$AT | j 'o.referralCode')" null

# ---- public referral lookup
check "valid code names the staff member" "$(call GET /auth/referral/$C1 | j 'o.valid+":"+o.staffName')" "true:Sam Staff"
check "lookup is case-insensitive" "$(call GET /auth/referral/$(echo $C1 | tr A-Z a-z) | j 'o.valid')" true
check "unknown code is just invalid" "$(call GET /auth/referral/ZZZZZZZZ | j 'o.valid')" false
check "lookup reveals only the name" "$(call GET /auth/referral/$C1 | j 'Object.keys(o).sort().join(",")')" "staffName,valid"

# ---- sign-up
U1=$(reg ruser1$R $C1); check "sign-up under Sam creates a USER" "$(echo "$U1" | j 'o.role')" USER
U1ID=$(echo "$U1" | j 'o.id'); check "placed under the right staff, agent, agency" "$(echo "$U1" | j '[o.parentId,o.staffId,o.agentId,o.agencyId].join()')" "$S1,$S1,$AT,$AG"
check "new user can sign in" "$([ -n "$(login ruser1$R $P)" ] && echo y)" y
check "lower-case code also works" "$(reg ruser2$R $(echo $C1 | tr A-Z a-z) | j 'o.role')" USER
check "invalid code refused" "$(code POST /auth/register "{\"username\":\"rbad$R\",\"email\":\"rbad$R@t.io\",\"password\":\"$P\",\"fullName\":\"Bad\",\"referralCode\":\"ZZZZZZZZ\"}")" 400
check "malformed code refused" "$(code POST /auth/register "{\"username\":\"rbad2$R\",\"email\":\"rbad2$R@t.io\",\"password\":\"$P\",\"fullName\":\"Bad\",\"referralCode\":\"x\"}")" 400
check "sign-up without a code refused" "$(code POST /auth/register "{\"username\":\"rbad3$R\",\"email\":\"rbad3$R@t.io\",\"password\":\"$P\",\"fullName\":\"Bad\"}")" 400
check "old staffUsername field no longer accepted" "$(code POST /auth/register "{\"username\":\"rbad4$R\",\"email\":\"rbad4$R@t.io\",\"password\":\"$P\",\"fullName\":\"Bad\",\"staffUsername\":\"rs1$R\"}")" 400
check "short password refused" "$(code POST /auth/register "{\"username\":\"rbad5$R\",\"email\":\"rbad5$R@t.io\",\"password\":\"short\",\"fullName\":\"Bad\",\"referralCode\":\"$C1\"}")" 400
check "duplicate username refused" "$(code POST /auth/register "{\"username\":\"ruser1$R\",\"email\":\"dup$R@t.io\",\"password\":\"$P\",\"fullName\":\"Dup\",\"referralCode\":\"$C1\"}")" 409
check "cannot sign up as another role (extra fields rejected)" "$(code POST /auth/register "{\"username\":\"rsneak$R\",\"email\":\"rsneak$R@t.io\",\"password\":\"$P\",\"fullName\":\"S\",\"referralCode\":\"$C1\",\"role\":\"SUPER_ADMIN\"}")" 400

# ---- visibility
TOKEN=$(login rs1$R $P); check "the staff member sees their sign-up" "$(call GET '/accounts?role=USER&limit=50' | j 'o.items.some(u=>u.username==="ruser1'$R'")')" true
TOKEN=$(login rag$R $P); check "agency sees it too" "$(call GET /accounts/$U1ID | j 'o.username')" "ruser1$R"
TOKEN=$(login rag2$R $P); check "other agency cannot see it" "$(code GET /accounts/$U1ID)" 404
TOKEN=$(login rs3$R $P); check "other staff cannot see it" "$(code GET /accounts/$U1ID)" 404

# ---- suspended branches
TOKEN=$ADMIN; call POST /accounts/$S2/suspend '{"reason":"test suspension"}' >/dev/null
check "suspended staff's code stops working" "$(call GET /auth/referral/$C2 | j 'o.valid')" false
check "sign-up under suspended staff refused" "$(code POST /auth/register "{\"username\":\"rsus$R\",\"email\":\"rsus$R@t.io\",\"password\":\"$P\",\"fullName\":\"S\",\"referralCode\":\"$C2\"}")" 400
call POST /accounts/$S2/reactivate '{"reason":"test reactivate"}' >/dev/null
call POST /accounts/$AG2/suspend '{"reason":"test suspension"}' >/dev/null
check "sign-up under a suspended agency refused" "$(code POST /auth/register "{\"username\":\"rsus2$R\",\"email\":\"rsus2$R@t.io\",\"password\":\"$P\",\"fullName\":\"S\",\"referralCode\":\"$C3\"}")" 409
call POST /accounts/$AG2/reactivate '{"reason":"test reactivate"}' >/dev/null
call PUT /system/status '{"status":"MAINTENANCE"}' >/dev/null
check "sign-up closed during maintenance" "$(code POST /auth/register "{\"username\":\"rmnt$R\",\"email\":\"rmnt$R@t.io\",\"password\":\"$P\",\"fullName\":\"M\",\"referralCode\":\"$C1\"}")" 403
call PUT /system/status '{"status":"ACTIVE"}' >/dev/null

# ---- change role / move
TU=$(login ruser1$R $P)
chg() { call POST /accounts/$1/change-role "{\"role\":\"$2\",\"parentId\":\"$3\"}"; }
check "move a user to another staff member" "$(chg $U1ID USER $S2 | j 'o.parentId')" "$S2"
check "user's old sessions were ended" "$(TOKEN=$TU code GET /auth/me)" 401
check "user can sign in again" "$([ -n "$(login ruser1$R $P)" ] && echo y)" y
TOKEN=$(login rs1$R $P); check "old staff no longer sees the user" "$(code GET /accounts/$U1ID)" 404
TOKEN=$(login rs2$R $P); check "new staff sees the user" "$(call GET /accounts/$U1ID | j 'o.username')" "ruser1$R"
TOKEN=$ADMIN
check "wrong-level parent refused" "$(code POST /accounts/$U1ID/change-role "{\"role\":\"USER\",\"parentId\":\"$AT\"}")" 400
check "staff with users below cannot be changed" "$(code POST /accounts/$S2/change-role "{\"role\":\"USER\",\"parentId\":\"$S1\"}")" 400
check "administrators cannot be changed" "$(code POST /accounts/$SA/change-role "{\"role\":\"USER\",\"parentId\":\"$S1\"}")" 400
check "cannot make someone Super Admin" "$(code POST /accounts/$U1ID/change-role "{\"role\":\"SUPER_ADMIN\",\"parentId\":\"$S1\"}")" 400
check "unknown parent refused" "$(code POST /accounts/$U1ID/change-role "{\"role\":\"USER\",\"parentId\":\"00000000-0000-4000-8000-000000000000\"}")" 404
TOKEN=$(login rag$R $P); check "agency cannot change roles" "$(code POST /accounts/$U1ID/change-role "{\"role\":\"USER\",\"parentId\":\"$S1\"}")" 403
TOKEN=$ADMIN
# promote a leaf user to staff under the agent, then demote again
UP=$(reg rpromo$R $C1 | j 'o.id')
PRM=$(chg $UP STAFF $AT); check "promote a user to staff under an agent" "$(echo "$PRM" | j 'o.role')" STAFF
check "promoted account has a referral code" "$(echo "$PRM" | j 'o.referralCode')" "$(call GET /accounts/$UP | j 'o.referralCode')"
check "promoted account is wired to agent and agency" "$(echo "$PRM" | j '[o.parentId,o.agentId,o.agencyId,o.staffId].join()')" "$AT,$AT,$AG,"
NEWC=$(echo "$PRM" | j 'o.referralCode'); check "promoted staff's code accepts sign-ups" "$(reg rviapromo$R $NEWC | j 'o.parentId')" "$UP"
TOKEN=$(login rpromo$R $P); check "promoted staff can now create users" "$(code POST /accounts "{\"role\":\"USER\",\"username\":\"rmade$R\",\"email\":\"rmade$R@t.io\",\"password\":\"$P\",\"fullName\":\"Made\"}")" 201
TOKEN=$ADMIN
check "staff with sign-ups cannot be demoted" "$(code POST /accounts/$UP/change-role "{\"role\":\"USER\",\"parentId\":\"$S1\"}")" 400
UD=$(reg rleaf$R $C1 | j 'o.id'); chg $UD STAFF $AT >/dev/null
DEM=$(chg $UD USER $S1); check "demote a leaf staff back to user: code removed" "$(echo "$DEM" | j 'o.role+":"+o.referralCode')" "USER:null"
check "audit trail records role changes" "$(call GET '/audit?action=ACCOUNT_ROLE_CHANGED&limit=5' | j 'o.total>=3')" true

if [ -n "${PSQL_URL:-}" ]; then
  q() { psql "$PSQL_URL" -qtAc "$1"; }
  check "closure rows: moved user has exactly staff, agent, agency, admin + self" "$(q "select count(*) from account_hierarchy where descendant_id='$U1ID'")" 5
  check "closure: moved user is no longer below the old staff" "$(q "select count(*) from account_hierarchy where ancestor_id='$S1' and descendant_id='$U1ID'")" 0
  check "closure: moved user is below the new staff" "$(q "select depth from account_hierarchy where ancestor_id='$S2' and descendant_id='$U1ID'")" 1
  check "DB: only staff may hold a referral code" "$(psql "$PSQL_URL" -qtAc "UPDATE users SET referral_code='ABCDEFGH' WHERE id='$U1ID'" 2>&1 | grep -c users_referral_only_staff)" 1
fi
exit $fail
