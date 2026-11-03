#!/usr/bin/env bash
# Needs the server run with ACCOUNTING_ALLOW_SELF_APPROVAL=true (single admin).
# Usage: API=... ADMIN_PASSWORD=... [PSQL_URL=...] ./test/cashflow-recon-smoke.sh
set -u
API=${API:-http://localhost:3000/api/v1}; PW=${ADMIN_PASSWORD:?}; R=$RANDOM; Y=$((3100 + R % 600)); fail=0
j() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const o=JSON.parse(s);console.log($1)}catch{console.log('')}})"; }
call() { curl -s -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
code() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} ${3:+-d "$3"}; }
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (got '$2' want '$3')"; fail=1; fi; }
TOKEN=$(call POST /auth/login "{\"username\":\"superadmin\",\"password\":\"$PW\"}" | j 'o.accessToken')
acct() { call POST /accounting/accounts "{\"code\":\"$1$R\",\"name\":\"$2 $R\",\"class\":\"$3\"}" | j 'o.id'; }
BANK=$(acct 1 Bank ASSET); EQUIP=$(acct 15 Equipment ASSET); EQ=$(acct 3 Capital EQUITY); REV=$(acct 4 Revenue INCOME); EXP=$(acct 5 Expense EXPENSE)
check "non-asset cannot be cash" "$(code PATCH /accounting/accounts/$EQ/cash-settings '{"isCash":true}')" 400
check "bank flagged cash" "$(call PATCH /accounting/accounts/$BANK/cash-settings '{"isCash":true}' | j 'o.isCash')" true
call PATCH /accounting/accounts/$EQUIP/cash-settings '{"cashFlowActivity":"INVESTING"}' >/dev/null
call POST /accounting/periods "{\"name\":\"CF$Y-$R\",\"startDate\":\"$Y-01-01\",\"endDate\":\"$Y-12-31\"}" >/dev/null
post() { local id; id=$(call POST /accounting/journals "{\"entryDate\":\"$Y-$2\",\"description\":\"$1\",\"lines\":[{\"accountId\":\"$3\",\"debit\":\"$5\"},{\"accountId\":\"$4\",\"credit\":\"$5\"}]}" | j 'o.id')
  for a in submit approve post; do call POST /accounting/journals/$id/$a '{}' >/dev/null; done; echo $id; }
post "Owner funding" 01-05 $BANK $EQ 1000 >/dev/null
post "Sale" 02-01 $BANK $REV 300 >/dev/null
post "Rent" 03-01 $EXP $BANK 100 >/dev/null
post "Buy equipment" 04-01 $EQUIP $BANK 400 >/dev/null
post "Non-cash revaluation" 05-01 $EQUIP $REV 50 >/dev/null
check "cash flag locked after activity" "$(code PATCH /accounting/accounts/$BANK/cash-settings '{"isCash":false}')" 409

CF=$(call GET "/accounting/reports/cash-flow?from=$Y-01-01&to=$Y-12-31")
check "operating = 200" "$(echo "$CF" | j 'Number(o.operating)')" 200
check "investing = -400" "$(echo "$CF" | j 'Number(o.investing)')" -400
check "financing = 1000" "$(echo "$CF" | j 'Number(o.financing)')" 1000
check "net change = 800" "$(echo "$CF" | j 'Number(o.netChange)')" 800
check "non-cash entry excluded (revenue inflow 300 only)" "$(echo "$CF" | j 'Number(o.sections.OPERATING.find(l=>l.name==="Revenue '$R'").inflow)')" 300
check "opening + net = closing" "$(echo "$CF" | j 'o.reconciles')" true
check "cash flow csv" "$(curl -s "$API/accounting/reports/cash-flow/export.csv?from=$Y-01-01&to=$Y-12-31" -H "authorization: Bearer $TOKEN" | head -1 | tr -d '\r')" "Section,Code,Account,Inflow,Outflow,Net"
check "bad range rejected" "$(code GET "/accounting/reports/cash-flow?from=$Y-12-31&to=$Y-01-01")" 400

check "recon rejects non-cash account" "$(code POST /accounting/reconciliations "{\"accountId\":\"$REV\",\"statementDate\":\"$Y-12-31\",\"statementBalance\":\"0\"}")" 400
RC=$(call POST /accounting/reconciliations "{\"accountId\":\"$BANK\",\"statementDate\":\"$Y-12-31\",\"statementBalance\":\"799.00\"}" | j 'o.id')
check "recon draft created" "$([ -n "$RC" ] && echo y)" y
check "second open recon refused" "$(code POST /accounting/reconciliations "{\"accountId\":\"$BANK\",\"statementDate\":\"$Y-12-31\",\"statementBalance\":\"1\"}")" 409
V=$(call GET /accounting/reconciliations/$RC); LINES=$(echo "$V" | j 'JSON.stringify(o.candidates.map(c=>c.id))')
check "4 candidate lines" "$(echo "$V" | j 'o.candidates.length')" 4
check "cannot complete with nothing cleared" "$(code POST /accounting/reconciliations/$RC/complete)" 409
FOREIGN=$(call GET "/accounting/journals?limit=1" | j 'o.items[0].lines[0].id')
check "foreign line refused" "$(code POST /accounting/reconciliations/$RC/clear "{\"lineIds\":[\"$FOREIGN\"]}")" 400
check "clear lines" "$(call POST /accounting/reconciliations/$RC/clear "{\"lineIds\":$LINES}" | j 'o.cleared.length')" 4
check "wrong statement balance => not reconciled" "$(code POST /accounting/reconciliations/$RC/complete)" 409
call POST /accounting/reconciliations/$RC/cancel >/dev/null
RC=$(call POST /accounting/reconciliations "{\"accountId\":\"$BANK\",\"statementDate\":\"$Y-12-31\",\"statementBalance\":\"800.00\"}" | j 'o.id')
V=$(call GET /accounting/reconciliations/$RC); call POST /accounting/reconciliations/$RC/clear "{\"lineIds\":$(echo "$V" | j 'JSON.stringify(o.candidates.map(c=>c.id))')}" >/dev/null
check "difference zero" "$(call GET /accounting/reconciliations/$RC | j 'Number(o.summary.difference)')" 0
check "complete reconciliation" "$(call POST /accounting/reconciliations/$RC/complete | j 'o.status')" COMPLETED
check "completed recon cannot be cancelled" "$(code POST /accounting/reconciliations/$RC/cancel)" 409
RC2=$(call POST /accounting/reconciliations "{\"accountId\":\"$BANK\",\"statementDate\":\"$((Y+1))-01-31\",\"statementBalance\":\"800\"}" | j 'o.id')
REUSE=$(echo "$V" | j 'o.candidates[0].id')
check "cleared line cannot be reused" "$(code POST /accounting/reconciliations/$RC2/clear "{\"lineIds\":[\"$REUSE\"]}")" 400
check "next statement date must follow the last" "$(code POST /accounting/reconciliations "{\"accountId\":\"$BANK\",\"statementDate\":\"$Y-06-01\",\"statementBalance\":\"1\"}")" 400
check "status: nothing unreconciled" "$(call GET /accounting/reconciliations/status | j 'o.find(a=>a.code==="1'$R'").unreconciledLines')" 0

if [ -n "${PSQL_URL:-}" ]; then
  chk() { psql "$PSQL_URL" -qtAc "$2" 2>&1 | grep -q "$3" && echo "PASS $1" || { echo "FAIL $1"; fail=1; }; }
  chk "DB blocks editing completed recon" "UPDATE reconciliation_records SET statement_balance=1 WHERE id='$RC'" "immutable"
  chk "DB blocks deleting completed recon" "DELETE FROM reconciliation_records WHERE id='$RC'" "cannot be deleted"
  chk "DB blocks removing cleared item" "DELETE FROM reconciliation_items WHERE recon_id='$RC'" "immutable"
  chk "DB blocks flipping cash flag" "UPDATE chart_of_accounts SET is_cash=false WHERE id='$BANK'" "cash flag"
fi
exit $fail
