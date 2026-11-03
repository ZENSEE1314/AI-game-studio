#!/usr/bin/env bash
# E2E accounting checks. Usage: API=... ADMIN_PASSWORD=... [PSQL_URL=...] [EXPECT_SOD=1] ./test/accounting-smoke.sh
# EXPECT_SOD=1: server runs with segregation of duties on; verifies self-approval is refused.
set -u
API=${API:-http://localhost:3000/api/v1}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; Y=$((2200 + R % 700)); fail=0
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
TOKEN=$(call POST /auth/login "{\"username\":\"superadmin\",\"password\":\"$PW\"}" | j 'o.accessToken')
acct() { call POST /accounting/accounts "{\"code\":\"$1$R\",\"name\":\"$2\",\"class\":\"$3\"}" | j 'o.id'; }
CASH=$(acct 1 "Cash $R" ASSET); EQ=$(acct 3 "Capital $R" EQUITY); REV=$(acct 4 "Revenue $R" INCOME); EXP=$(acct 5 "Expense $R" EXPENSE)
check "chart accounts created" "$([ -n "$CASH$EQ$REV$EXP" ] && echo y)" y
A0=$(call GET "/accounting/reports/balance-sheet?asOf=$Y-12-31" | j 'Number(o.totalAssets)')
P=$(call POST /accounting/periods "{\"name\":\"FY$Y-$R\",\"startDate\":\"$Y-01-01\",\"endDate\":\"$Y-12-31\"}" | j 'o.id')
check "period created" "$([ -n "$P" ] && echo y)" y
check "overlapping period rejected" "$(code POST /accounting/periods "{\"name\":\"X$R\",\"startDate\":\"$Y-06-01\",\"endDate\":\"$Y-07-01\"}")" 409
check "entry outside any period rejected" "$(code POST /accounting/journals "{\"entryDate\":\"1999-01-01\",\"description\":\"old\",\"lines\":[{\"accountId\":\"$CASH\",\"debit\":\"1\"},{\"accountId\":\"$EQ\",\"credit\":\"1\"}]}")" 400
check "unbalanced entry rejected" "$(code POST /accounting/journals "{\"entryDate\":\"$Y-01-05\",\"description\":\"bad\",\"lines\":[{\"accountId\":\"$CASH\",\"debit\":\"100\"},{\"accountId\":\"$EQ\",\"credit\":\"99\"}]}")" 400

je() { call POST /accounting/journals "{\"entryDate\":\"$Y-01-10\",\"description\":\"$1\",\"lines\":[{\"accountId\":\"$2\",\"debit\":\"$4\"},{\"accountId\":\"$3\",\"credit\":\"$4\"}]}" | j 'o.id'; }
flow() { call POST /accounting/journals/$1/submit >/dev/null; call POST /accounting/journals/$1/approve '{}' >/dev/null; call POST /accounting/journals/$1/post >/dev/null; }
J1=$(je "Owner funding" $CASH $EQ 1000.00); check "draft created" "$(call GET /accounting/journals/$J1 | j 'o.status')" DRAFT
check "cannot post a draft" "$(code POST /accounting/journals/$J1/post)" 409
if [ "${EXPECT_SOD:-}" = 1 ]; then
  call POST /accounting/journals/$J1/submit >/dev/null
  check "self-approval refused (segregation of duties)" "$(code POST /accounting/journals/$J1/approve '{}')" 403
  echo "SOD verified; remaining flow needs self-approval enabled"; exit $fail
fi
flow $J1; check "workflow reaches POSTED" "$(call GET /accounting/journals/$J1 | j 'o.status')" POSTED
check "approval trail recorded" "$(call GET /accounting/journals/$J1 | j 'o.approvals.map(a=>a.action).join(",")')" "SUBMIT,APPROVE,POST"
check "posted entry cannot be edited" "$(code PATCH /accounting/journals/$J1 '{"description":"tamper"}')" 409
J2=$(je "Sale" $CASH $REV 300.00); flow $J2
J3=$(je "Rent" $EXP $CASH 100.00); flow $J3
TB=$(call GET "/accounting/reports/trial-balance?asOf=$Y-12-31")
check "trial balance debits=credits" "$(echo "$TB" | j 'o.balanced')" true
BS=$(call GET "/accounting/reports/balance-sheet?asOf=$Y-12-31"); check "balance sheet balances" "$(echo "$BS" | j 'o.balanced')" true
check "total assets rose by 1200" "$(node -e "console.log(Math.round(($(echo "$BS" | j 'Number(o.totalAssets)') - $A0)*100)/100)")" 1200
check "net profit 200" "$(call GET "/accounting/reports/income-statement?from=$Y-01-01&to=$Y-12-31" | j 'Number(o.netProfit)')" 200

RV=$(call POST /accounting/journals/$J2/reverse "{\"reason\":\"customer refund\",\"date\":\"$Y-03-01\"}"); check "reversal created" "$(echo "$RV" | j 'o.reversal?"y":""')" y
check "original marked REVERSED" "$(call GET /accounting/journals/$J2 | j 'o.status')" REVERSED
check "cannot reverse twice" "$(code POST /accounting/journals/$J2/reverse "{\"reason\":\"again\",\"date\":\"$Y-03-01\"}")" 409
check "net profit after reversal -100" "$(call GET "/accounting/reports/income-statement?from=$Y-01-01&to=$Y-12-31" | j 'Number(o.netProfit)')" -100
check "csv export" "$(curl -s "$API/accounting/reports/trial-balance/export.csv?asOf=$Y-12-31" -H "authorization: Bearer $TOKEN" | head -1 | tr -d '\r')" "Code,Account,Class,Debit,Credit"
check "bad report kind rejected" "$(code GET "/accounting/reports/nope/export.csv?asOf=$Y-12-31")" 400
J4=$(je "Open item" $CASH $EQ 5.00)
check "cannot close period with unposted entry" "$(code POST /accounting/periods/$P/close)" 409
call POST /accounting/journals/$J4/submit >/dev/null; call POST /accounting/journals/$J4/reject '{"comment":"wrong amount"}' >/dev/null
check "reject returns to DRAFT" "$(call GET /accounting/journals/$J4 | j 'o.status')" DRAFT
call PATCH /accounting/journals/$J4 "{\"lines\":[{\"accountId\":\"$CASH\",\"debit\":\"7\"},{\"accountId\":\"$EQ\",\"credit\":\"7\"}]}" >/dev/null; flow $J4
check "period closes when all posted" "$(code POST /accounting/periods/$P/close)" 201
check "posting into closed period refused" "$(code POST /accounting/journals "{\"entryDate\":\"$Y-02-01\",\"description\":\"late\",\"lines\":[{\"accountId\":\"$CASH\",\"debit\":\"1\"},{\"accountId\":\"$EQ\",\"credit\":\"1\"}]}")" 409

if [ -n "${PSQL_URL:-}" ]; then
  chk() { psql "$PSQL_URL" -qtAc "$2" 2>&1 | grep -q "$3" && echo "PASS $1" || { echo "FAIL $1"; fail=1; }; }
  chk "DB blocks editing posted line" "UPDATE journal_entry_lines SET debit=9999 WHERE entry_id='$J1'" "immutable"
  chk "DB blocks deleting posted entry" "DELETE FROM journal_entries WHERE id='$J1'" "cannot be deleted"
  chk "DB blocks un-posting" "UPDATE journal_entries SET status='DRAFT' WHERE id='$J1'" "immutable"
  chk "DB blocks line insert on posted entry" "INSERT INTO journal_entry_lines(id,entry_id,account_id,debit,credit) VALUES (gen_random_uuid(),'$J1','$CASH',1,0)" "immutable"
  chk "DB blocks approval log edits" "DELETE FROM financial_approvals" "append-only"
fi
TOKEN=; check "unauthenticated denied" "$(code GET /accounting/accounts)" 401
exit $fail
