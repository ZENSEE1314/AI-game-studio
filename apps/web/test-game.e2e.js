const { chromium } = require('playwright');
const API = 'http://localhost:3055/api/v1'; const W = 'http://localhost:3066'; const PW = 'LongPassword123';
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
(async () => {
  const t = Date.now() % 100000; const names = { a: 'gwa' + t, b: 'gwb' + t };
  const call = async (T, m, p, b) => (await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(T ? { authorization: 'Bearer ' + T } : {}) }, body: b ? JSON.stringify(b) : undefined })).json();
  const T = (await call(null, 'POST', '/auth/login', { username: 'superadmin', password: 'SuperSecret12345' })).accessToken;
  const sa = (await call(T, 'GET', '/auth/me')).id;
  const ag = await call(T, 'POST', '/accounts', { role: 'AGENCY', parentId: sa, username: 'gwag' + t, email: 'gwag' + t + '@t.io', password: PW, fullName: 'G Agency' });
  const at = await call(T, 'POST', '/accounts', { role: 'AGENT', parentId: ag.id, username: 'gwat' + t, email: 'gwat' + t + '@t.io', password: PW, fullName: 'G Agent' });
  const mk = (u, n) => call(T, 'POST', '/accounts', { role: 'STAFF', parentId: at.id, username: u, email: u + '@t.io', password: PW, fullName: n });
  const sa1 = await mk(names.a, 'Alice Staff'), sb1 = await mk(names.b, 'Bob Staff');
  for (const r of await call(T, 'GET', '/game/rounds')) if (['DRAFT','OPEN','LOCKED','RESULT_PENDING'].includes(r.status)) await call(T, 'POST', `/game/rounds/${r.id}/cancel`);
  const b = await chromium.launch();
  const open = async (user, pw = PW) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 950 } })).newPage(); p.on('dialog', d => d.accept(d.type() === 'prompt' ? '60000' : undefined)); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.errs = errs;
    await p.goto(W + '/login'); await p.fill('input[name=username]', user); await p.fill('input[name=password]', pw); await p.click('button'); await p.waitForURL('**/dashboard'); await p.waitForSelector('aside nav'); return p; };

  const admin = await open('superadmin', 'SuperSecret12345');
  ok('admin sidebar has Game Rounds + Credits', (await admin.locator('aside nav a').allTextContents()).join('|').includes('Game Rounds|Credits'));
  // grant via UI
  await admin.goto(W + '/credits'); await admin.waitForSelector('table');
  for (const u of [names.a, names.b]) { await admin.fill('input[placeholder^=Search]', u); await admin.press('input[placeholder^=Search]', 'Enter'); await admin.waitForSelector('tr:has-text("' + u + '")');
    await admin.locator('tr:has-text("' + u + '")').locator('button:has-text("Grant")').click(); await admin.waitForSelector('text=Granted 60,000 credits to ' + u); }
  ok('credits granted via UI', true);
  // create + open round via UI
  await admin.goto(W + '/game'); await admin.fill('input[name=name]', 'UI Round ' + t); await admin.click('button:has-text("Create round")'); await admin.waitForSelector('a:has-text("UI Round ' + t + '")');
  await admin.click('a:has-text("UI Round ' + t + '")'); await admin.waitForSelector('button:has-text("Open for picks")'); await admin.click('button:has-text("Open for picks")'); await admin.waitForSelector('button:has-text("Lock picks")'); ok('round opened via UI', true);

  // Alice plays
  const alice = await open(names.a); ok('player sidebar has Play, no admin items', (await alice.locator('aside nav a').allTextContents()).join('|').includes('Play') && !(await alice.locator('aside nav').innerText()).includes('Credits'));
  await alice.goto(W + '/play'); await alice.waitForSelector('button[aria-pressed]'); await alice.waitForSelector('text=60,000');
  await alice.locator('button[aria-pressed]', { hasText: /^5$/ }).click(); await alice.locator('button[aria-pressed]', { hasText: /^12$/ }).click();
  ok('save enabled with default minimum stakes', await alice.locator('button:has-text("Save picks")').isEnabled());
  await alice.fill('input[aria-label="credits for 5"]', '5000'); ok('below-minimum disables save', await alice.locator('button:has-text("Save picks")').isDisabled());
  await alice.fill('input[aria-label="credits for 5"]', '60000'); ok('over-balance disables save', await alice.locator('button:has-text("Save picks")').isDisabled());
  await alice.fill('input[aria-label="credits for 5"]', '30000'); await alice.click('button:has-text("Save picks")'); await alice.waitForSelector('text=Picks saved');
  await alice.reload(); await alice.waitForSelector('input[aria-label="credits for 12"]'); ok('picks persisted after reload', true);
  ok('credits held: available 20,000', await alice.locator('div:has-text("Available") >> text=20,000').count() > 0);
  console.log('step: bob');
  const bob = await open(names.b); await bob.goto(W + '/play'); await bob.waitForSelector('button[aria-pressed]'); await bob.locator('button[aria-pressed]', { hasText: /^20$/ }).click(); await bob.click('button:has-text("Save picks")'); await bob.waitForSelector('text=Picks saved');
  console.log('step: admin lock');
  await admin.reload(); await admin.waitForTimeout(1500); console.log('admin url', admin.url(), (await admin.locator('main').innerText()).slice(0,300).replace(/\n/g,' | ')); await admin.waitForSelector('button:has-text("Lock picks")'); await admin.click('button:has-text("Lock picks")'); console.log('clicked lock'); await admin.waitForTimeout(1500); console.log((await admin.locator('main').innerText()).slice(0,120).replace(/\n/g,' | ')); await admin.waitForSelector('input[placeholder="1–27"]');
  await alice.reload(); await alice.waitForSelector('text=Picks are locked'); ok('player sees locked state', await alice.locator('button[aria-pressed]').first().isDisabled());
  await admin.fill('input[placeholder="1–27"]', '12'); await admin.click('button:has-text("Set result")'); await admin.waitForSelector('text=Preview: number 12');
  ok('preview names the winner before publishing', await admin.locator('text=' + names.a).count() > 0);
  await admin.click('button:has-text("Publish result 12")'); await admin.waitForSelector('text=Published result: 12'); ok('result published via UI', true);
  ok('publish button gone (final)', await admin.locator('button:has-text("Publish result")').count() === 0);
  await alice.reload(); await alice.waitForSelector('text=Winning number: 12'); ok('winner sees result + her name', await alice.locator('text=Alice Staff').count() > 0);
  ok('credits fully returned (60,000, 0 held)', await alice.locator('div:has-text("Total") >> text=60,000').count() > 0);
  await alice.waitForSelector('text=1 win(s)'); ok('leaderboard shows the win', true);
  await bob.reload(); await bob.waitForSelector('text=Winning number: 12'); ok('loser sees result, keeps credits', await bob.locator('div:has-text("Total") >> text=60,000').count() > 0);
  for (const [n, p] of [['admin', admin], ['alice', alice], ['bob', bob]]) ok(n + ': no page errors', p.errs.length === 0);
  await alice.screenshot({ path: 'play.png' }); await admin.screenshot({ path: 'round.png' });
  await b.close();
})().catch(e => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });
