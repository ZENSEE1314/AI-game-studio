const { chromium } = require('playwright');
const API = 'http://localhost:3055/api/v1'; const W = 'http://localhost:3066'; const PW = 'LongPassword123';
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
(async () => {
  const t = Date.now() % 100000;
  const call = async (T, m, p, b) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(T ? { authorization: 'Bearer ' + T } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
  const T = (await call(null, 'POST', '/auth/login', { username: 'superadmin', password: 'SuperSecret12345' })).accessToken;
  const sa = (await call(T, 'GET', '/auth/me')).id;
  const ag = await call(T, 'POST', '/accounts', { role: 'AGENCY', parentId: sa, username: 'nbag' + t, email: 'nbag' + t + '@t.io', password: PW, fullName: 'N Agency' });
  const at = await call(T, 'POST', '/accounts', { role: 'AGENT', parentId: ag.id, username: 'nbat' + t, email: 'nbat' + t + '@t.io', password: PW, fullName: 'N Agent' });
  const st = await call(T, 'POST', '/accounts', { role: 'STAFF', parentId: at.id, username: 'nbst' + t, email: 'nbst' + t + '@t.io', password: PW, fullName: 'Nina Staff' });
  await call(T, 'POST', '/wallet/grant', { userId: st.id, amount: 50000 });
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(W + '/login'); await p.fill('input[name=username]', 'nbst' + t); await p.fill('input[name=password]', PW); await p.click('button'); await p.waitForURL('**/dashboard'); await p.waitForSelector('aside nav');
  ok('no badge before anything happens', await p.locator('[aria-label$="unread"]').count() === 0);
  // admin opens a round (API) -> player sees badge after next refresh
  const rd = await call(T, 'POST', '/game/rounds', { name: 'Bell Round ' + t }); await call(T, 'POST', `/game/rounds/${rd.id}/open`);
  await p.reload(); await p.waitForSelector('[aria-label$="unread"]'); ok('badge appears after round opens', (await p.locator('[aria-label$="unread"]').first().innerText()) >= '1');
  await p.click('aside a:has-text("Notifications")'); await p.waitForSelector('text=New round open'); ok('notification listed with round name', await p.locator('text=Bell Round ' + t).count() > 0);
  await p.click('button:has-text("New round open") >> nth=0'); await p.waitForURL('**/play'); ok('click opens the Play page', true);
  await p.waitForTimeout(800); ok('badge cleared after reading', await p.locator('[aria-label$="unread"]').count() === 0);
  // result notification
  await p.goto(W + '/play'); await p.waitForSelector('button[aria-pressed]'); await p.locator('button[aria-pressed]', { hasText: /^6$/ }).click(); await p.click('button:has-text("Save picks")'); await p.waitForSelector('text=Picks saved');
  await call(T, 'POST', `/game/rounds/${rd.id}/lock`); await call(T, 'POST', `/game/rounds/${rd.id}/result`, { number: 6 }); await call(T, 'POST', `/game/rounds/${rd.id}/publish`);
  await p.goto(W + '/notifications'); await p.waitForSelector('text=You won'); ok('winner notification shown', true);
  await p.click('button:has-text("Mark all read")'); await p.waitForSelector('text=Mark all read >> xpath=self::button[@disabled]', { state: 'attached' }).catch(() => {}); await p.waitForTimeout(600);
  ok('mark all read clears badge', await p.locator('[aria-label$="unread"]').count() === 0);
  ok('no page errors', errs.length === 0); await p.screenshot({ path: 'notifications.png' }); await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
