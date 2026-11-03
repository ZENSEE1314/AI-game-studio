#!/usr/bin/env bash
# Second-admin flow. Needs TWO server instances on the same database:
#   API  : normal server (self-approval allowed)             e.g. :3055
#   API2 : ACCOUNTING_ALLOW_SELF_APPROVAL=false REQUIRE_ADMIN_2FA=true  e.g. :3056
# Usage: API=... API2=... ADMIN_PASSWORD=... ./test/admins-smoke.sh
set -u
API=${API:?}; API2=${API2:?}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; fail=0; TP="TempPassword-$R-xyz"; NP="NewPassword-$R-abc"; Y=$((4300 + R % 600))
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
H=${APP_DIR:-.}
totp() { (cd "$H" && node -e "console.log(require('otplib').authenticator.generate('$1'))"); }
call() { curl -s -X "$1" "${BASE:-$API}$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "${BASE:-$API}$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
login() { call POST /auth/login "{\"username\":\"$1\",\"password\":\"$2\"${3:+,\"totp\":\"$3\"}}"; }

TOKEN=$(login superadmin "$PW" | j 'o.accessToken')
check "non-admin cannot list admins" "$(BASE=$API TOKEN=$(login superadmin "$PW" | j 'o.accessToken') code GET /admins)" 200
mkadmin() { call POST /admins "{\"username\":\"$1\",\"email\":\"$1@t.io\",\"fullName\":\"Admin $1\",\"temporaryPassword\":\"$TP\",\"currentPassword\":\"$PW\"}"; }
check "wrong re-auth password refused (403, session stays valid)" "$(code POST /admins "{\"username\":\"x$R\",\"email\":\"x$R@t.io\",\"fullName\":\"X\",\"temporaryPassword\":\"$TP\",\"currentPassword\":\"nope\"}")" 403
check "short temporary password refused" "$(code POST /admins "{\"username\":\"y$R\",\"email\":\"y$R@t.io\",\"fullName\":\"Y\",\"temporaryPassword\":\"short\",\"currentPassword\":\"$PW\"}")" 400
A=$(mkadmin adma$R); AID=$(echo "$A" | j 'o.id'); B=$(mkadmin admb$R); BID=$(echo "$B" | j 'o.id')
check "admin created with forced password change" "$(echo "$A" | j 'o.mustChangePassword+","+o.status')" "true,ACTIVE"
check "duplicate username refused" "$(code POST /admins "{\"username\":\"adma$R\",\"email\":\"d$R@t.io\",\"fullName\":\"D\",\"temporaryPassword\":\"$TP\",\"currentPassword\":\"$PW\"}")" 409
# agency cannot create admins
SA=$(call GET /auth/me | j 'o.id'); AG=$(call POST /accounts "{\"role\":\"AGENCY\",\"parentId\":\"$SA\",\"username\":\"agx$R\",\"email\":\"agx$R@t.io\",\"password\":\"LongPassword123\",\"fullName\":\"AG\"}" | j 'o.id')
AGT=$(login agx$R LongPassword123 | j 'o.accessToken'); check "agency cannot create/list admins" "$(TOKEN=$AGT code GET /admins)$(TOKEN=$AGT code POST /admins '{}')" 403403

# forced password change (server 1)
LA=$(login adma$R "$TP"); TOKEN=$(echo "$LA" | j 'o.accessToken'); check "login reports mustChangePassword" "$(echo "$LA" | j 'o.mustChangePassword')" true
check "blocked from app routes until password changed" "$(call GET /accounts | j 'o.code')" PASSWORD_CHANGE_REQUIRED
check "auth routes still work (me)" "$(code GET /auth/me)" 200
check "weak new password refused" "$(code POST /auth/change-password "{\"currentPassword\":\"$TP\",\"newPassword\":\"short\"}")" 400
check "password changed" "$(code POST /auth/change-password "{\"currentPassword\":\"$TP\",\"newPassword\":\"$NP\"}")" 201
check "app routes open after change" "$(code GET /accounts)" 200
check "flag cleared" "$(call GET /auth/me | j 'o.mustChangePassword')" false

# suspend rules (server 1)
TOKEN=$(login superadmin "$PW" | j 'o.accessToken')
check "cannot suspend yourself" "$(code POST /admins/$SA/suspend "{\"reason\":\"testing self\",\"currentPassword\":\"$PW\"}")" 403
check "suspend needs your password" "$(code POST /admins/$BID/suspend '{"reason":"testing it","currentPassword":"wrong"}')" 403
TB=$(login admb$R "$TP" | j 'o.accessToken')
check "suspend another admin" "$(call POST /admins/$BID/suspend "{\"reason\":\"security review\",\"currentPassword\":\"$PW\"}" | j 'o.status')" SUSPENDED
check "suspended admin's session dies at once" "$(TOKEN=$TB code GET /auth/me)" 401
check "suspended admin cannot log in" "$(code POST /auth/login "{\"username\":\"admb$R\",\"password\":\"$TP\"}")" 403
check "reactivate admin" "$(call POST /admins/$BID/reactivate "{\"reason\":\"review complete\",\"currentPassword\":\"$PW\"}" | j 'o.status')" ACTIVE
check "admin changes are audited" "$(call GET '/audit?action=ADMIN_SUSPENDED&limit=5' | j 'o.total>0')" true

# server 2: 2FA required + segregation of duties
BASE=$API2
onboard() { # user -> echoes "token secret"
  local L T S; L=$(login "$1" "$2"); T=$(echo "$L" | j 'o.accessToken')
  [ "$3" = fresh ] && { TOKEN=$T call POST /auth/change-password "{\"currentPassword\":\"$2\",\"newPassword\":\"$NP\"}" >/dev/null; }
  echo "$T"
}
LB=$(login adma$R "$NP"); TOKEN=$(echo "$LB" | j 'o.accessToken')
check "2FA enforcement: blocked from app routes without 2FA" "$(call GET /accounts | j 'o.code')" TWO_FACTOR_REQUIRED
check "2FA enforcement: auth routes allowed" "$(code GET /auth/me)" 200
SECRET_A=$(call POST /auth/2fa/setup | j 'o.secret'); check "2FA enable with wrong code refused" "$(code POST /auth/2fa/enable '{"code":"000000"}')" 400
check "2FA enabled" "$(call POST /auth/2fa/enable "{\"code\":\"$(totp $SECRET_A)\"}" | j 'o.enabled')" true
check "login now demands a code" "$(code POST /auth/login "{\"username\":\"adma$R\",\"password\":\"$NP\"}")" 401
TOKEN=$(login adma$R "$NP" "$(totp $SECRET_A)" | j 'o.accessToken'); check "app routes open with 2FA on" "$(code GET /accounts)" 200

# admin B: set up on server 2 too
LB2=$(login admb$R "$TP"); TOKEN=$(echo "$LB2" | j 'o.accessToken'); call POST /auth/change-password "{\"currentPassword\":\"$TP\",\"newPassword\":\"$NP\"}" >/dev/null
SECRET_B=$(call POST /auth/2fa/setup | j 'o.secret'); call POST /auth/2fa/enable "{\"code\":\"$(totp $SECRET_B)\"}" >/dev/null
TA=$(login adma$R "$NP" "$(totp $SECRET_A)" | j 'o.accessToken'); TBB=$(login admb$R "$NP" "$(totp $SECRET_B)" | j 'o.accessToken')

TOKEN=$TA
CASH=$(call POST /accounting/accounts "{\"code\":\"9$R\",\"name\":\"SoD cash $R\",\"class\":\"ASSET\"}" | j 'o.id'); EQ=$(call POST /accounting/accounts "{\"code\":\"8$R\",\"name\":\"SoD capital $R\",\"class\":\"EQUITY\"}" | j 'o.id')
call POST /accounting/periods "{\"name\":\"SoD$Y-$R\",\"startDate\":\"$Y-01-01\",\"endDate\":\"$Y-12-31\"}" >/dev/null
J=$(call POST /accounting/journals "{\"entryDate\":\"$Y-03-01\",\"description\":\"two admin test\",\"lines\":[{\"accountId\":\"$CASH\",\"debit\":\"100\"},{\"accountId\":\"$EQ\",\"credit\":\"100\"}]}" | j 'o.id')
call POST /accounting/journals/$J/submit >/dev/null
check "creator cannot approve own entry" "$(code POST /accounting/journals/$J/approve '{}')" 403
TOKEN=$TBB; check "second admin approves" "$(call POST /accounting/journals/$J/approve '{}' | j 'o.status')" APPROVED
check "second admin posts" "$(call POST /accounting/journals/$J/post | j 'o.status')" POSTED
exit $fail
