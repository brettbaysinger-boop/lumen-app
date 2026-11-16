// Browser acceptance for the standalone Projects route (web build, Playwright).
//
// Prereq: two web exports (see tests/project-steward/README.md):
//   $DIST_NOLIVE  built WITHOUT EXPO_PUBLIC_PROJECT_STEWARD_SNAPSHOT_URL
//   $DIST_LIVE    built WITH it = http://127.0.0.1:8765/project-steward/snapshot
// The live endpoint is never real: Playwright intercepts it and returns synthetic
// 401 / offline / invalid / stale / timeout / OK responses.
//
// Usage: DIST_NOLIVE=... DIST_LIVE=... [SHOTS=dir] node tests/project-steward/browser.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const DIST_NOLIVE = process.env.DIST_NOLIVE;
const DIST_LIVE = process.env.DIST_LIVE;
const SHOTS = process.env.SHOTS || path.join(__dirname, 'screenshots');
const NOW = '2026-11-16T02:30:00Z';
const SNAPSHOT_URL = 'http://127.0.0.1:8765/project-steward/snapshot';
const FIXTURE_COUNT = 11;

if (!DIST_NOLIVE || !DIST_LIVE) {
  console.error('NOT_RUN: set DIST_NOLIVE and DIST_LIVE');
  process.exit(2);
}

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html'); // SPA fallback
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log(`FAIL  ${name}\n      ${String(e && e.message).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function liveSnapshot(generatedAt) {
  return {
    version: '1.0',
    generated_at: generatedAt,
    projects: [
      {
        id: 'synthetic-live-a',
        name: 'Synthetic live row A',
        priority: 'p1',
        state: 'tested',
        deployment: 'not_deployed',
        evidence_level: 'git_verified',
        summary: 'Synthetic response served by the browser test, not real data.',
        repositories: ['example/repo'],
        blocked_by: [],
        sources: [{ kind: 'git_pr', ref: 'example/repo#1', observed_at: generatedAt, commit_sha: 'abcdef1' }],
        observed_at: generatedAt,
      },
    ],
  };
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const sNo = await serve(path.resolve(DIST_NOLIVE));
  const sLive = await serve(path.resolve(DIST_LIVE));
  const baseNo = `http://127.0.0.1:${sNo.address().port}`;
  const baseLive = `http://127.0.0.1:${sLive.address().port}`;
  const browser = await chromium.launch();

  async function newPage(width, height) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(NOW));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    return { ctx, page, errors };
  }
  const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
  async function noHorizontalScroll(page, width) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(sw <= width, `page scrollWidth ${sw} > viewport ${width}`);
  }

  // ---------- Demo fixture, phone width ----------
  {
    const { ctx, page, errors } = await newPage(360, 800);
    await page.goto(`${baseNo}/project-steward`);
    await check('demo is the default when no live URL is configured; DEMO banner shown', async () => {
      await tid(page, 'ps-origin-demo').waitFor({ timeout: 20000 });
      assert((await tid(page, 'ps-mode-live').innerText()).includes('not set'), 'live tab should say not set');
    });
    await check(`all ${FIXTURE_COUNT} fixture cards render, each with a DEMO badge`, async () => {
      const cards = page.locator('[data-testid^="ps-card-"]');
      assert((await cards.count()) === FIXTURE_COUNT, `cards=${await cards.count()}`);
      const badges = page.locator('[data-testid^="ps-card-"] [data-testid="ps-demo-badge"]');
      assert((await badges.count()) === FIXTURE_COUNT, `demo badges=${await badges.count()}`);
    });
    await check('required projects present', async () => {
      const text = await tid(page, 'ps-overview').innerText();
      for (const n of ['PestTrails', 'Chorusfall', 'DreamVault', 'Wisdom of the Crowd', "Brett's Games", 'Forge', 'Lumen', 'Brother Memory']) {
        assert(text.includes(n), `missing ${n}`);
      }
    });
    await check('cards show Dev and Deploy as separate badges', async () => {
      const card = await tid(page, 'ps-card-lumen').innerText();
      assert(/DEV\s*Coded/i.test(card), card);
      assert(/DEPLOY\s*Verified \(historical\)/i.test(card), card);
    });
    await check('stale and never-checked projects are marked', async () => {
      assert((await tid(page, 'ps-card-forge').innerText()).includes('STALE'), 'forge not stale');
      assert((await tid(page, 'ps-card-dreamvault').innerText()).includes('UNKNOWN · never checked'), 'dreamvault');
    });
    await check('360px: no horizontal page scroll', () => noHorizontalScroll(page, 360));
    await page.screenshot({ path: path.join(SHOTS, 'overview-demo-360.png'), fullPage: true });

    await check('search narrows to matching project', async () => {
      await tid(page, 'ps-search').fill('pest-control');
      await page.waitForTimeout(150);
      assert((await page.locator('[data-testid^="ps-card-"]').count()) === 1, 'expected 1 card');
      assert((await tid(page, 'ps-result-count').innerText()).startsWith('1 of'), 'count');
      await tid(page, 'ps-search').fill('zzz-nothing');
      await tid(page, 'ps-empty').waitFor({ timeout: 2000 });
      await tid(page, 'ps-search').fill('');
    });
    await check('Blocked filter shows only blocked projects', async () => {
      await tid(page, 'ps-filter-blocked').click();
      await page.waitForTimeout(150);
      const ids = await page.locator('[data-testid^="ps-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      assert(JSON.stringify(ids) === JSON.stringify(['ps-card-project-steward', 'ps-card-lumen']), JSON.stringify(ids));
      await tid(page, 'ps-filter-all').click();
    });
    await check('P0 priority filter', async () => {
      await tid(page, 'ps-priority-p0').click();
      await page.waitForTimeout(150);
      assert((await page.locator('[data-testid^="ps-card-"]').count()) === 1, 'expected 1');
      await tid(page, 'ps-priority-any').click();
    });
    await check('cards carry at most two compact signals; clean projects carry none', async () => {
      const s = await tid(page, 'ps-signals-project-steward').innerText();
      assert(s.includes('Your decision needed') && s.includes('4 open PRs'), s);
      assert((await tid(page, 'ps-signals-pesttrails').count()) === 0, 'pesttrails should have no signals');
      assert((await tid(page, 'ps-attention').innerText()).includes('Waiting on your decision'), 'queue reason');
    });
    await check('needs-attention queue lists blockers first', async () => {
      const q = await tid(page, 'ps-attention').innerText();
      assert(q.indexOf('Project Steward') < q.indexOf('Forge'), 'order');
      assert(q.includes('Gold Master not released'), 'lumen blocker text');
    });
    await check('card opens detail route with dev/deploy panels and sources', async () => {
      await tid(page, 'ps-card-lumen').click();
      await tid(page, 'ps-detail-name').waitFor({ timeout: 5000 });
      assert(page.url().includes('/project-steward/lumen'), page.url());
      assert(page.url().includes('source=demo'), 'mode kept in URL');
      // The overview stays mounted under the stack, so scope to the detail screen.
      await page.locator('[data-testid="ps-detail"] [data-testid="ps-origin-demo"]').waitFor();
      assert((await tid(page, 'ps-detail-deployment').innerText()).includes('Not a statement about today'), 'deploy explain');
    });
    await check('summary tab: next milestone, PR list capped with expand, link chips', async () => {
      assert((await tid(page, 'ps-detail-next').innerText()).includes('Gold Master'), 'next');
      assert((await tid(page, 'ps-detail-prs').innerText()).includes('Open pull requests (17)'), 'pr count');
      assert((await page.locator('[data-testid="ps-pr-row"]').count()) === 4, 'preview should show 4');
      assert((await page.locator('[data-testid="ps-pr-row"]').first().innerText()).match(/Draft\s*open \d+[mhd] · updated/), 'review + wait');
      await tid(page, 'ps-prs-toggle').click();
      assert((await page.locator('[data-testid="ps-pr-row"]').count()) === 17, 'expanded');
      await tid(page, 'ps-prs-toggle').click();
      await tid(page, 'ps-link-repo').waitFor();
      assert((await tid(page, 'ps-link-live').count()) === 0, 'no live URL may be shown for a real project');
      // Only one panel is mounted at a time.
      assert((await tid(page, 'ps-detail-sources').count()) === 0, 'evidence should be behind its tab');
    });
    await check('360px detail: no horizontal page scroll', () => noHorizontalScroll(page, 360));
    await page.screenshot({ path: path.join(SHOTS, 'detail-lumen-summary-360.png'), fullPage: true });
    await check('activity tab: last commit, honest "no deploy", timeline', async () => {
      await tid(page, 'ps-tab-activity').click();
      assert((await tid(page, 'ps-last-commit').innerText()).includes('main @38cc92a'), 'commit');
      const dep = await tid(page, 'ps-last-deploy').innerText();
      assert(dep.includes('None recorded') && dep.includes('not deployments'), dep);
      assert((await page.locator('[data-testid="ps-timeline-event"]').count()) === 8, 'timeline');
      await noHorizontalScroll(page, 360);
    });
    await page.screenshot({ path: path.join(SHOTS, 'detail-lumen-activity-360.png'), fullPage: true });
    await check('evidence tab: CI as its own source with checked time, sources, unknowns', async () => {
      await tid(page, 'ps-tab-evidence').click();
      const ci = await tid(page, 'ps-detail-ci').innerText();
      assert(ci.includes('No CI runs') && ci.includes('main @38cc92a') && /[Cc]hecked/.test(ci), ci);
      assert((await tid(page, 'ps-detail-sources').innerText()).includes('lumen-app#10'), 'source ref');
      assert((await tid(page, 'ps-detail-facts').innerText()).includes('still running now'), 'unknown fact');
      await noHorizontalScroll(page, 360);
    });
    await page.screenshot({ path: path.join(SHOTS, 'detail-lumen-evidence-360.png'), fullPage: true });
    await check('never-checked project detail shows the unverified notice', async () => {
      await page.goto(`${baseNo}/project-steward/dreamvault?source=demo`);
      await tid(page, 'ps-detail-stale').waitFor({ timeout: 20000 });
      await tid(page, 'ps-insights-missing').waitFor();
      assert((await tid(page, 'ps-detail-prs').count()) === 0, 'no PR section without data');
      await tid(page, 'ps-tab-activity').click();
      await tid(page, 'ps-activity-missing').waitFor();
      await tid(page, 'ps-tab-evidence').click();
      await tid(page, 'ps-no-sources').waitFor();
      await tid(page, 'ps-ci-missing').waitFor();
      await tid(page, 'ps-tab-summary').click();
    });
    await page.screenshot({ path: path.join(SHOTS, 'detail-dreamvault-demo-360.png'), fullPage: true });
    await check('unknown id shows not-found, not a blank page', async () => {
      await page.goto(`${baseNo}/project-steward/does-not-exist?source=demo`);
      await tid(page, 'ps-detail-not-found').waitFor({ timeout: 20000 });
    });
    await check('live mode without URL shows "not configured" and NO fixture data', async () => {
      await page.goto(`${baseNo}/project-steward?source=live`);
      await tid(page, 'ps-state-missing').waitFor({ timeout: 20000 });
      assert((await page.locator('[data-testid^="ps-card-"]').count()) === 0, 'cards leaked');
      assert((await tid(page, 'ps-origin-demo').count()) === 0, 'demo banner leaked');
    });
    await page.screenshot({ path: path.join(SHOTS, 'state-not-configured-360.png'), fullPage: true });
    await check('"View labelled demo instead" switches explicitly to demo', async () => {
      await tid(page, 'ps-open-demo').click();
      await tid(page, 'ps-origin-demo').waitFor({ timeout: 5000 });
      assert(page.url().includes('source=demo'), page.url());
    });
    await check('no uncaught page errors (phone run)', () => assert(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }

  // ---------- Demo fixture, desktop ----------
  {
    const { ctx, page, errors } = await newPage(1280, 900);
    await page.goto(`${baseNo}/project-steward`);
    await check('desktop: overview renders with attention sidebar', async () => {
      await tid(page, 'ps-origin-demo').waitFor({ timeout: 20000 });
      const card = await tid(page, 'ps-card-pesttrails').boundingBox();
      const side = await tid(page, 'ps-attention').boundingBox();
      assert(side.x > card.x + card.width - 1, 'sidebar should be to the right of cards');
    });
    await check('desktop: no horizontal page scroll', () => noHorizontalScroll(page, 1280));
    await page.screenshot({ path: path.join(SHOTS, 'overview-demo-1280.png'), fullPage: true });
    await page.goto(`${baseNo}/project-steward/project-steward?source=demo`);
    await tid(page, 'ps-detail-name').waitFor({ timeout: 20000 });
    await check('desktop detail: owner decision is the first thing on Summary', async () => {
      const next = await tid(page, 'ps-detail-next').boundingBox();
      const dev = await tid(page, 'ps-detail-development').boundingBox();
      assert(next.y < dev.y, 'next-up should sit above the status row');
      assert((await tid(page, 'ps-detail-next').innerText()).toUpperCase().includes('WAITING ON YOUR DECISION'), 'decision');
      await tid(page, 'ps-link-docs').waitFor();
    });
    await page.screenshot({ path: path.join(SHOTS, 'detail-project-steward-summary-1280.png'), fullPage: true });
    await tid(page, 'ps-tab-evidence').click();
    await tid(page, 'ps-detail-ci').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'detail-project-steward-evidence-1280.png'), fullPage: true });
    await check('no uncaught page errors (desktop run)', () => assert(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }

  // ---------- Live API states (synthetic, intercepted) ----------
  const liveCases = [
    ['401 -> sign-in required', 'ps-state-unauthorized', (r) => r.fulfill({ status: 401, body: '' }), 'state-401-360.png'],
    ['403 -> access denied', 'ps-state-unauthorized', (r) => r.fulfill({ status: 403, body: '' }), null],
    ['network failure -> offline', 'ps-state-offline', (r) => r.abort('internetdisconnected'), 'state-offline-360.png'],
    ['404 -> snapshot not found', 'ps-state-missing', (r) => r.fulfill({ status: 404, body: '' }), null],
    ['500 -> server error', 'ps-state-http_error', (r) => r.fulfill({ status: 500, body: '' }), null],
    ['schema-invalid body -> invalid, nothing shown', 'ps-state-invalid',
      (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...liveSnapshot(NOW), extra: 1 }) }),
      'state-invalid-360.png'],
    ['old generated_at -> live STALE banner', 'ps-origin-live-stale',
      (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveSnapshot('2026-11-10T00:00:00Z')) }),
      'state-live-stale-360.png'],
    ['fresh snapshot -> live banner, no DEMO badges', 'ps-origin-live',
      (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveSnapshot('2026-11-16T01:30:00Z')) }),
      null],
  ];
  for (const [name, testId, handler, shot] of liveCases) {
    const { ctx, page, errors } = await newPage(360, 800);
    await page.route(SNAPSHOT_URL, handler);
    await page.goto(`${baseLive}/project-steward`);
    await check(`live: ${name}`, async () => {
      await tid(page, testId).waitFor({ timeout: 20000 });
      assert((await page.locator('[data-testid="ps-demo-badge"]').count()) === 0, 'DEMO badge on live/failed view');
      if (!testId.startsWith('ps-origin-live')) {
        assert((await page.locator('[data-testid^="ps-card-"]').count()) === 0, 'cards shown on failure');
      } else {
        assert((await page.locator('[data-testid^="ps-card-"]').count()) === 1, 'expected 1 live card');
      }
      assert(errors.length === 0, errors.join(' | '));
    });
    if (shot) await page.screenshot({ path: path.join(SHOTS, shot), fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(360, 800);
    await page.route(SNAPSHOT_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveSnapshot('2026-11-16T02:00:00Z')) }));
    await page.goto(`${baseLive}/project-steward/synthetic-live-a`);
    await check('live v1 detail: says PRs/CI/activity are not available, shows none', async () => {
      const m = await tid(page, 'ps-insights-missing').innerText({ timeout: 20000 });
      assert(m.includes('serves the v1.0 contract'), m);
      assert((await tid(page, 'ps-detail-prs').count()) === 0 && (await tid(page, 'ps-detail-links').count()) === 0, 'leak');
      assert((await page.locator('[data-testid="ps-demo-badge"]').count()) === 0, 'demo badge on live');
    });
    await ctx.close();
  }
  // ---------- Proposed v1.1 from the "live" API (synthetic, intercepted) ----------
  for (const [w, h, tag] of [[360, 800, '360'], [1280, 900, '1280']]) {
    const { ctx, page, errors } = await newPage(w, h);
    const body = liveSnapshot('2026-11-16T02:00:00Z');
    body.version = '1.1';
    body.stale_after_seconds = 3600 * 24;
    body.projects[0].name = 'Synthetic live row A\u202E<b>x</b>';
    body.projects[0].insights = {
      observed_at: '2026-11-16T02:00:00Z',
      open_prs: { observed_at: '2026-11-16T02:00:00Z', items: [
        { ref: 'https://github.com/example/repo/pull/7', title: 'Synthetic PR awaiting review', review: 'review_required', opened_at: '2026-11-14T02:00:00Z', updated_at: '2026-11-16T01:00:00Z', head_sha: 'abcdef1' },
      ] },
      last_commit: { at: '2026-11-16T01:00:00Z', ref: null, commit_sha: 'abcdef1', branch: 'main', observed_at: '2026-11-16T02:00:00Z' },
      last_deploy: null,
      ci: { state: 'failing', branch: 'main', run_ref: null, commit_sha: 'abcdef1', observed_at: '2026-11-16T02:00:00Z' },
      next: [{ kind: 'owner_decision', text: 'Synthetic decision', ref: null }],
      activity: [{ at: '2026-11-16T01:00:00Z', kind: 'commit', text: 'Synthetic commit', ref: null }],
      links: [{ kind: 'repo', label: 'Repository', url: 'https://github.com/example/repo' }],
    };
    body.projects.push({ ...liveSnapshot('2026-11-14T20:00:00Z').projects[0], id: 'synthetic-live-b', name: 'Synthetic live row B' });
    await page.route(SNAPSHOT_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
    await page.goto(`${baseLive}/project-steward`);
    await check(`live v1.1 @${tag}: overview shows real signals, server stale window, no DEMO`, async () => {
      const banner = await tid(page, 'ps-origin-live').innerText({ timeout: 20000 });
      assert(banner.includes('contract v1.1') && banner.includes('Stale after 24h'), banner);
      const sig = await tid(page, 'ps-signals-synthetic-live-a').innerText();
      assert(sig.includes('Your decision needed') && sig.includes('CI failing'), sig);
      // Row B was checked 30h ago: stale under the server's 24h window (fresh under the 72h default).
      assert((await tid(page, 'ps-card-synthetic-live-b').innerText()).includes('STALE'), 'server window not applied');
      assert((await tid(page, 'ps-signals-synthetic-live-b').count()) === 0, 'B has no insights');
      const name = await tid(page, 'ps-card-synthetic-live-a').innerText();
      assert(name.includes('Synthetic live row A<b>x</b>') && !name.includes('\u202E'), 'name must render as literal text');
      assert((await page.locator('[data-testid="ps-demo-badge"]').count()) === 0, 'DEMO on live');
      assert((await tid(page, 'ps-origin-demo').count()) === 0, 'demo banner on live');
      await noHorizontalScroll(page, w);
    });
    await check(`live v1.1 @${tag}: detail tabs show the API's PRs, CI and activity`, async () => {
      await tid(page, 'ps-card-synthetic-live-a').click();
      await tid(page, 'ps-detail-name').waitFor({ timeout: 5000 });
      assert((await tid(page, 'ps-detail-prs').innerText()).match(/#7 Synthetic PR awaiting review[\s\S]*Awaiting review[\s\S]*open 2d/), 'pr row');
      assert((await tid(page, 'ps-insights-missing').count()) === 0, 'should not claim unavailable');
      await tid(page, 'ps-tab-activity').click();
      assert((await tid(page, 'ps-last-deploy').innerText()).includes('None recorded'), 'deploy');
      await tid(page, 'ps-tab-evidence').click();
      assert((await tid(page, 'ps-detail-ci').innerText()).includes('Failing'), 'ci');
      assert((await page.locator('[data-testid="ps-demo-badge"]').count()) === 0, 'DEMO on live detail');
      await noHorizontalScroll(page, w);
      assert(errors.length === 0, errors.join(' | '));
    });
    await page.screenshot({ path: path.join(SHOTS, `live-v11-synthetic-evidence-${tag}.png`), fullPage: true });
    await check(`live v1.1 @${tag}: project without insights says "not collected"`, async () => {
      await page.goto(`${baseLive}/project-steward/synthetic-live-b`);
      const m = await tid(page, 'ps-insights-missing').innerText({ timeout: 20000 });
      assert(m.includes('have not been collected'), m);
    });
    await ctx.close();
  }

  // ---------- PS-02's own offline fixture served as the API response (optional) ----------
  if (process.env.PS02_FIXTURE) {
    const { ctx, page, errors } = await newPage(360, 800);
    const body = fs.readFileSync(process.env.PS02_FIXTURE, 'utf8');
    await page.route(SNAPSHOT_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
    await page.goto(`${baseLive}/project-steward`);
    await check('PS-02 fixture (v1.0) renders as a live snapshot without DEMO labels', async () => {
      await page.locator('[data-testid^="ps-origin-live"]').waitFor({ timeout: 20000 });
      const n = JSON.parse(body).projects.length;
      assert((await page.locator('[data-testid^="ps-card-"]').count()) === n, 'card count');
      assert((await page.locator('[data-testid="ps-demo-badge"]').count()) === 0, 'DEMO on live');
      assert(errors.length === 0, errors.join(' | '));
    });
    await ctx.close();
  } else {
    console.log('NOT_RUN  PS-02 fixture render (set PS02_FIXTURE=path/to/valid_snapshot.json)');
  }

  {
    const { ctx, page } = await newPage(360, 800);
    // Never answer: the client's 10s timeout must fire. Fake clock does not move timers.
    await page.route(SNAPSHOT_URL, () => {});
    await page.goto(`${baseLive}/project-steward`);
    await check('live: no answer -> timeout state after 10s', async () => {
      await tid(page, 'ps-state-loading').waitFor({ timeout: 20000 });
      await tid(page, 'ps-state-timeout').waitFor({ timeout: 15000 });
    });
    await ctx.close();
  }

  await browser.close();
  sNo.close();
  sLive.close();
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed; screenshots in ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
