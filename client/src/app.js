// Olympus (3,3) dashboard — metrics, live rebase, stake/bond/claim.
(function () {
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let M = null, A = null, wallet = localStorage.getItem('rohm_w') || '';
  let anchor = null; // {index, nextIn, rate, rebaseSec, t, agons, totalAgons}
  let stakeMode = 'stake';

  const isW = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);
  const commas = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const money = (n) => '$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(2));
  const tok = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? commas(n, 0) : commas(n, 2);
  const pct = (n) => (n * 100).toLocaleString('en-US', { maximumFractionDigits: n < 0.01 ? 3 : 2 }) + '%';
  const apyFmt = (n) => commas(n, 0) + '%';
  function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', 2400); }

  // ---- views ----
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    ['dash', 'stake', 'bond', 'calc'].forEach((v) => $(v).classList.toggle('hide', v !== t.dataset.view));
  }));

  // ---- wallet ----
  if (wallet) $('wallet').value = wallet;
  $('wallet').addEventListener('change', setW);
  $('wallet').addEventListener('keydown', (e) => { if (e.key === 'Enter') setW(); });
  function setW() { const v = $('wallet').value.trim(); if (isW(v)) { wallet = v; localStorage.setItem('rohm_w', v); loadAccount(); } else if (!v) { wallet = ''; A = null; } }

  // ---- fetch ----
  async function loadMetrics() { try { M = await (await fetch('/api/metrics')).json(); reanchor(); renderMetrics(); renderBonds(); } catch (e) {} }
  async function loadAccount() { if (!isW(wallet)) return; try { A = await (await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet }) })).json(); reanchor(); renderAccount(); } catch (e) {} }
  function reanchor() {
    if (!M) return;
    anchor = { index: M.index, nextIn: M.nextRebaseIn, rate: M.rate, rebaseSec: M.rebaseSec, t: performance.now(),
      agons: A && A.staked ? A.staked / A.index : 0, totalAgons: M.totalStaked / M.index, treasury: M.treasury, totalStaked: M.totalStaked, price: M.price };
  }
  function liveIndex() {
    if (!anchor) return 1; let idx = anchor.index; let nextIn = anchor.nextIn - (performance.now() - anchor.t) / 1000;
    let guard = 0; while (nextIn < 0 && guard++ < 50) { idx *= (1 + anchor.rate); nextIn += anchor.rebaseSec; }
    const frac = 1 - nextIn / anchor.rebaseSec;
    return { index: idx * (1 + anchor.rate * frac), nextIn };
  }

  // ---- render ----
  function renderMetrics() {
    if (!M) return;
    $('mApy').textContent = apyFmt(M.apy);
    $('mTreasury').textContent = money(M.treasury);
    $('mBacking').textContent = 'backing $' + M.backingPerToken.toFixed(6) + ' / $rOHM';
    $('mPrice').textContent = '$' + M.price.toFixed(4);
    $('mMc').textContent = 'mcap ' + money(M.marketCap);
    $('mRatio').textContent = pct(M.stakingRatio) + ' of supply';
    $('mRunway').textContent = M.runwayDays >= 365 ? (M.runwayDays / 365).toFixed(1) + ' yr' : Math.round(M.runwayDays) + ' days';
    $('mEpoch').textContent = M.epoch;
    $('yApy').textContent = apyFmt(M.apy);
    const roi = (days) => Math.pow(1 + M.rate, days * 86400 / M.rebaseSec) - 1;
    $('yRoi5').textContent = pct(roi(5)); $('yRoi7').textContent = pct(roi(7)); $('yRoi30').textContent = pct(roi(30)); $('yRoi1y').textContent = apyFmt(M.apy);
    // top stakers
    if (M.leaderboard && M.leaderboard.length) {
      $('lbPanel').style.display = 'block';
      $('lbRows').innerHTML = M.leaderboard.map((b, i) => `<div class="row"><span>${i + 1}. <b style="color:var(--ink);font-family:'JetBrains Mono',monospace">${b.wallet}</b></span><span><b class="tl">${tok(b.staked)} sROHM</b> <span style="color:var(--mut)">· ${pct(b.share)}</span></span></div>`).join('');
    }
    calc();
    if (M.mint) { const bar = $('ca'); bar.style.display = 'flex'; $('caV').textContent = M.mint.slice(0, 5) + '…' + M.mint.slice(-4); bar.href = 'https://dexscreener.com/robinhood/' + M.mint; $('caCopy').onclick = (e) => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(M.mint); $('caCopy').textContent = 'Copied'; setTimeout(() => $('caCopy').textContent = 'Copy', 1200); }; }
  }
  function renderAccount() {
    if (!A) return;
    $('yBalance').textContent = tok(A.balance) + ' $rOHM';
    $('yNext').textContent = '+' + (A.staked * M.rate).toFixed(4) + ' $rOHM';
  }
  function renderBonds() {
    if (!M) return;
    $('bondCards').innerHTML = M.bonds.map((b) => `
      <div class="bond"><h3>${b.name}</h3>
        <div class="disc">${(b.discount * 100).toFixed(1)}%</div><div class="dl">discount · ${b.vestDays}-day vest</div>
        <div class="br"><span>Bond price</span><span>$${b.price.toFixed(4)}</span></div>
        <div class="br"><span>ROI</span><span style="color:var(--green)">+${(b.discount * 100).toFixed(1)}%</span></div>
        <div class="bf"><input id="bondAmt_${b.id}" type="text" inputmode="decimal" placeholder="$ amount"><button data-bond="${b.id}">Bond</button></div>
      </div>`).join('');
    $('bondCards').querySelectorAll('[data-bond]').forEach((btn) => btn.addEventListener('click', () => doBond(btn.dataset.bond)));
  }
  function renderYourBonds() {
    if (!A) { $('yourBonds').innerHTML = '<div class="psub" style="margin-top:10px">Paste a wallet to see your bonds.</div>'; return; }
    if (!A.bonds || !A.bonds.length) { $('yourBonds').innerHTML = '<div class="psub" style="margin-top:10px">No active bonds.</div>'; return; }
    $('yourBonds').innerHTML = A.bonds.map((b) => `
      <div class="yb"><span>${b.market} · <b style="color:var(--ink)">${tok(b.payout)}</b> $rOHM</span>
        <div class="prog"><i style="width:${(b.pct * 100).toFixed(0)}%"></i></div>
        <span style="color:var(--teal)">${tok(b.claimable)} claimable</span></div>`).join('') +
      `<div style="display:flex;gap:8px;margin-top:14px"><button class="btn ghost" id="claimBtn">Claim</button><button class="btn primary" id="claimStakeBtn">Claim &amp; Stake</button></div>`;
    const cb = $('claimBtn'), cs = $('claimStakeBtn'); if (cb) cb.onclick = () => doClaim(false); if (cs) cs.onclick = () => doClaim(true);
  }

  // ---- actions ----
  $('segStake').onclick = () => { stakeMode = 'stake'; $('segStake').classList.add('on'); $('segUnstake').classList.remove('on'); $('stakeBtn').textContent = 'Stake'; };
  $('segUnstake').onclick = () => { stakeMode = 'unstake'; $('segUnstake').classList.add('on'); $('segStake').classList.remove('on'); $('stakeBtn').textContent = 'Unstake'; };
  $('stakeMax').onclick = () => { if (!A) return; $('stakeAmt').value = (stakeMode === 'stake' ? A.balance : A.staked).toFixed(2); };
  $('stakeBtn').onclick = async () => {
    if (!isW(wallet)) return toast('paste your wallet first');
    const amt = parseFloat($('stakeAmt').value); if (!(amt > 0)) return toast('enter an amount');
    const r = await post('/api/' + stakeMode, { wallet, amount: amt });
    if (r.error) return toast(r.error); A = r; reanchor(); renderAccount(); $('stakeAmt').value = ''; toast((stakeMode === 'stake' ? 'Staked ' : 'Unstaked ') + tok(amt) + ' $rOHM (3,3)');
  };
  async function doBond(id) {
    if (!isW(wallet)) return toast('paste your wallet first');
    const amt = parseFloat(($('bondAmt_' + id) || {}).value); if (!(amt > 0)) return toast('enter an amount');
    const r = await post('/api/bond', { wallet, market: id, amount: amt });
    if (r.error) return toast(r.error); A = r; renderYourBonds(); loadMetrics(); $('bondAmt_' + id).value = ''; toast('Bonded — ' + tok(r.payout) + ' $rOHM vesting');
  }
  async function doClaim(autostake) {
    const r = await post('/api/claim', { wallet, autostake });
    if (r.error) return toast(r.error); A = r; reanchor(); renderAccount(); renderYourBonds(); toast(autostake ? 'Claimed & staked ' + tok(r.claimed) : 'Claimed ' + tok(r.claimed) + ' $rOHM');
  }
  async function post(url, b) { try { return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json(); } catch (e) { return { error: 'request failed' }; } }

  // ---- live tick ----
  function tick() {
    requestAnimationFrame(tick);
    if (!anchor || !M) return;
    const li = liveIndex();
    const cd = Math.max(0, li.nextIn); const mm = Math.floor(cd / 60), ss = Math.floor(cd % 60);
    const cds = mm + ':' + String(ss).padStart(2, '0');
    $('mRebase').textContent = cds; $('yRebase').textContent = cds;
    $('mIndex').textContent = li.index.toFixed(5);
    const ratio = li.index / anchor.index;
    $('mStaked').textContent = tok(anchor.totalStaked * ratio) + ' sROHM';
    if (A && anchor.agons) { $('yStaked').textContent = (anchor.agons * li.index).toFixed(4) + ' sROHM'; }
    else if (A) $('yStaked').textContent = '0.0000 sROHM';
  }
  // ---- calculator ----
  function calc() {
    if (!M) return; const amt = parseFloat($('calcAmt').value) || 0; const days = +$('calcDays').value;
    $('calcDaysL').textContent = days; $('calcPrice').textContent = M.price.toFixed(4);
    const out = amt * Math.pow(1 + M.rate, days * 86400 / M.rebaseSec);
    $('calcOut').textContent = tok(out) + ' $rOHM';
    $('calcMult').textContent = (out / (amt || 1)).toFixed(1) + '× your stake';
    $('calcUsd').textContent = money(out * M.price);
    $('calcProfit').textContent = '+' + money((out - amt) * M.price);
  }
  $('calcAmt').addEventListener('input', calc); $('calcDays').addEventListener('input', calc);

  $('xbtn').href = window.__X__ || 'https://x.com/RobinhoodOlympus';

  loadMetrics(); if (wallet) loadAccount();
  setInterval(loadMetrics, 6000); setInterval(() => { if (wallet) { loadAccount(); renderYourBonds(); } }, 6000);
  renderYourBonds(); requestAnimationFrame(tick);
})();
