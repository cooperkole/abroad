import { allocate } from './allocation.js';
import { unlockWithPasscode, unlockWithKey } from './crypto.js';
import { SECRETS } from './secrets.js';
import { detectPlatform, buildSmsLink, buildMessage, formatAmount, parseAmount, formatPhone } from './sms.js';

const DEPART = new Date(2027, 0, 4);
const HOME = new Date(2027, 4, 17);
const KEY_STORE = 'abroad.key';
const NAME_STORE = 'abroad.name';
const COUNTRY_CODES = { Spain: 'ES', 'United Kingdom': 'UK', Hungary: 'HU', Morocco: 'MA', Netherlands: 'NL', Portugal: 'PT', Italy: 'IT', Greece: 'GR' };
const HOVER_DELAY = 180;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Storage can throw (private mode, blocked cookies), so every call is guarded.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* page still works without it */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const state = {
  data: null,
  alloc: null,
  filter: 'all',
  sortAsc: true,
  unlocked: null, // { phone } once the passcode is right
  pendingChip: null,
  lastOpener: null,
  platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0),
};

/* ---------- Data + rendering ---------- */

async function loadData() {
  const res = await fetch('data/trips.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`trips.json ${res.status}`);
  return res.json();
}

function renderOverview() {
  const { alloc, data } = state;
  $('[data-total-received]').textContent = usd(alloc.totalReceived);
  $('[data-total-budget]').textContent = usd(alloc.totalBudget);
  $('[data-trip-count]').textContent = `(${data.trips.length} stops)`;
  const pct = alloc.totalBudget ? Math.min(100, (alloc.totalReceived / alloc.totalBudget) * 100) : 0;
  const bar = $('[data-total-bar]');
  bar.setAttribute('aria-valuenow', String(Math.round(pct)));
  bar.setAttribute('aria-valuetext', `${usd(alloc.totalReceived)} of ${usd(alloc.totalBudget)} raised`);
  requestAnimationFrame(() => bar.style.setProperty('--p', `${pct}%`));

  const funded = Object.values(alloc.trips).filter((t) => t.funded).length;
  const pool = data.generalFund + data.trips.reduce((s, t) => s + Math.max(0, t.received - t.budget), 0);
  const gs = $('[data-general-stat]');
  gs.textContent = pool > 0
    ? `${usd(pool)} has gone through the general fund so far. ${funded} of ${data.trips.length} trips fully funded.`
    : 'Nothing in it yet. You could be first!';
  if (alloc.unallocatedSurplus > 0) gs.textContent += ` Every trip is covered — ${usd(alloc.unallocatedSurplus)} extra goes to a bonus trip.`;
}

function legendHtml(a) {
  if (a.total <= 0) return '<p class="legend-empty">Nothing yet. Be the first to chip in!</p>';
  return `<ul class="legend">
    <li><span class="swatch swatch-direct" aria-hidden="true"></span>Chipped in directly <b>${usd(a.direct)}</b></li>
    <li><span class="swatch swatch-general" aria-hidden="true"></span>From the general fund <b>${usd(a.fromGeneral)}</b></li>
  </ul>`;
}

function tripCard(trip) {
  const a = state.alloc.trips[trip.id];
  const pct = Math.min(100, a.pct);
  const b = trip.breakdown;
  const subtotal = b.gettingThere + b.staying + b.eating + b.doing;
  const buffer = trip.budget - subtotal;
  const imgSmall = trip.image.replace(/\.jpg$/, '-800.jpg');
  const done = trip.status === 'done';
  const label = `${usd(a.total)} of ${usd(trip.budget)} raised, ${Math.floor(pct)} percent` +
    (a.total > 0 ? `: ${usd(a.direct)} chipped in directly and ${usd(a.fromGeneral)} from the general fund.` : '.');
  const [month, ...rest] = trip.tentativeDate.replace(/^Spring break · /, '').split(' ');

  return `
  <li class="trip" data-id="${esc(trip.id)}" data-region="${esc(trip.region)}" data-sort="${esc(trip.sortDate)}">
    <article class="card${a.funded ? ' is-funded' : ''}" aria-labelledby="t-${esc(trip.id)}">
      <div class="card-inner">
        <div class="face front">
          <div class="photo">
            <img src="${esc(imgSmall)}" srcset="${esc(imgSmall)} 800w, ${esc(trip.image)} 1200w"
                 sizes="(min-width: 1180px) 360px, (min-width: 720px) 46vw, 92vw"
                 width="1200" height="800" loading="lazy" decoding="async" alt="${esc(trip.imageAlt)}">
            <span class="stamp" aria-hidden="true"><span>${trip.flag}<small>${esc(COUNTRY_CODES[trip.country] ?? trip.country.slice(0, 2).toUpperCase())}</small></span></span>
            <span class="postmark" aria-hidden="true"><span>${esc(month.toUpperCase())}</span><b>${esc(rest.join(' '))}</b></span>
            ${a.funded ? '<span class="funded-stamp" aria-hidden="true">FUNDED ✓</span>' : ''}
          </div>
          <div class="front-body">
            <h3 class="trip-name" id="t-${esc(trip.id)}">${esc(trip.name)}</h3>
            <p class="trip-meta">${esc(trip.tentativeDate)}, 2027 <span class="tentative">tentative</span> · ${trip.nights} nights${done ? ' · <b class="been">✓ Been there</b>' : ''}</p>
            <p class="blurb">${esc(trip.blurb)}</p>
            <div class="flight" role="img" aria-label="${esc(label)}${a.funded ? ' Fully funded!' : ''}" style="--d:${a.directPct.toFixed(2)}%;--g:${a.generalPct.toFixed(2)}%" data-pct="${pct.toFixed(2)}">
              <span class="track" aria-hidden="true"><span class="seg seg-direct"></span><span class="seg seg-general"></span></span>
              <svg class="plane" aria-hidden="true"><use href="#i-plane"/></svg>
            </div>
            <p class="raised"><b>${usd(a.total)}</b> of ${usd(trip.budget)} <span class="pct">${Math.floor(pct)}%</span></p>
            ${legendHtml(a)}
            <div class="front-actions">
              <button class="btn btn-small btn-ghost" type="button" data-flip aria-expanded="false" aria-controls="back-${esc(trip.id)}">Budget breakdown <span aria-hidden="true">↻</span></button>
              <button class="btn btn-small btn-primary" type="button" data-chip="${esc(trip.id)}">Chip in</button>
            </div>
          </div>
        </div>
        <div class="face back" id="back-${esc(trip.id)}" inert>
          <div class="back-note">
            <p class="back-greet">Dear family, here's the plan for ${esc(trip.name)}:</p>
            <dl class="ledger">
              <div><dt>Getting there</dt><dd>${usd(b.gettingThere)}</dd></div>
              <div><dt>Staying</dt><dd>${usd(b.staying)}</dd></div>
              <div><dt>Eating</dt><dd>${usd(b.eating)}</dd></div>
              <div><dt>Doing</dt><dd>${usd(b.doing)}</dd></div>
              <div class="ledger-buffer"><dt>Just-in-case (10%)</dt><dd>${usd(buffer)}</dd></div>
              <div class="ledger-total"><dt>Total</dt><dd>${usd(trip.budget)}</dd></div>
            </dl>
            <p class="back-sign">Hostel dorms, budget flights, cheap eats. xo, Cooper</p>
          </div>
          <div class="back-address">
            <span class="stamp-box" aria-hidden="true">${trip.flag}</span>
            <p class="address" aria-hidden="true">Cooper's Travel Fund<br>c/o Barcelona<br>España</p>
            <button class="btn btn-primary btn-block" type="button" data-chip="${esc(trip.id)}">Chip in</button>
            <button class="btn btn-small btn-ghost btn-block" type="button" data-flip aria-expanded="true">Flip back <span aria-hidden="true">↻</span></button>
          </div>
        </div>
      </div>
    </article>
  </li>`;
}

function renderTrips() {
  const grid = $('[data-trip-grid]');
  grid.innerHTML = state.data.trips.map(tripCard).join('');
  applyFilterSort();
  wireCards(grid);
  observeCards(grid);
}

function renderPostcards() {
  const done = state.data.trips.filter((t) => t.status === 'done' && t.postcard && t.postcard.photo);
  if (!done.length) return; // keep the empty state from the HTML
  $('[data-postcards]').innerHTML = `<ul class="postcard-gallery">${done.map((t) => `
    <li><figure class="polaroid">
      <img src="${esc(t.postcard.photo)}" width="1200" height="900" loading="lazy" decoding="async" alt="Cooper in ${esc(t.name)}">
      <figcaption><b>${esc(t.name)}</b> ${esc(t.postcard.note)}</figcaption>
    </figure></li>`).join('')}</ul>`;
}

function applyFilterSort() {
  const grid = $('[data-trip-grid]');
  const items = $$('.trip', grid);
  items.sort((x, y) => (state.sortAsc ? 1 : -1) * x.dataset.sort.localeCompare(y.dataset.sort));
  let shown = 0;
  for (const li of items) {
    const show = state.filter === 'all' || li.dataset.region === state.filter;
    li.hidden = !show;
    if (show) shown++;
    grid.appendChild(li);
  }
  const what = { all: 'trips', spain: 'trips in Spain', beyond: 'trips beyond Spain' }[state.filter];
  $('[data-filter-status]').textContent = `Showing ${shown} ${what}, ${state.sortAsc ? 'soonest' : 'latest'} first.`;
}

function setFlipped(card, flipped) {
  card.classList.toggle('is-flipped', flipped);
  $('.back', card).inert = !flipped;
  $('.front', card).inert = flipped;
  $$('[data-flip]', card).forEach((b) => b.setAttribute('aria-expanded', String(flipped)));
}

function wireCards(grid) {
  for (const card of $$('.card', grid)) {
    // Mouse: hover flips. Touch: tap the card. Keyboard: the flip buttons.
    // A short delay so cards don't flip as the mouse merely passes over them.
    let timer;
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      timer = setTimeout(() => setFlipped(card, true), HOVER_DELAY);
    });
    card.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      setFlipped(card, false);
    });
    card.addEventListener('click', (e) => {
      const flipBtn = e.target.closest('[data-flip]');
      if (flipBtn) {
        const toBack = !card.classList.contains('is-flipped');
        setFlipped(card, toBack);
        $(toBack ? '.back [data-chip]' : '.front [data-flip]', card)?.focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('button, a')) return;
      if (e.pointerType !== 'mouse') setFlipped(card, !card.classList.contains('is-flipped'));
    });
  }
}

function observeCards(grid) {
  const launch = (li) => {
    const flight = $('.flight', li);
    flight.style.setProperty('--p', `${flight.dataset.pct}%`);
    li.classList.add('in-view');
  };
  if (!('IntersectionObserver' in window)) return $$('.trip', grid).forEach(launch);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { launch(e.target); io.unobserve(e.target); }
  }, { threshold: 0.35 });
  $$('.trip', grid).forEach((li) => io.observe(li));
}

function renderCountdown() {
  const now = new Date();
  const day = 86_400_000;
  const label = $('[data-countdown-label]');
  const out = $('[data-countdown]');
  if (now < DEPART) {
    const days = Math.ceil((DEPART - now) / day);
    label.textContent = 'Wheels up in';
    out.textContent = `${days} day${days === 1 ? '' : 's'}`;
  } else if (now < HOME) {
    label.textContent = 'In Barcelona';
    out.textContent = `Day ${Math.floor((now - DEPART) / day) + 1}`;
  } else {
    label.textContent = 'Status';
    out.textContent = 'Home safe ♥';
  }
}

/* ---------- Passcode gate ---------- */

const gate = () => $('#gate');

function showGate() {
  const d = gate();
  if (!d.open) d.showModal();
  $('[data-gate-input]').focus();
}

async function tryRememberedKey() {
  const key = store.get(KEY_STORE);
  if (!key) return false;
  try {
    const r = await unlockWithKey(key, SECRETS);
    if (r) { state.unlocked = { phone: r.phone }; return true; }
  } catch { /* fall through */ }
  store.remove(KEY_STORE);
  return false;
}

function wireGate() {
  const d = gate();
  const form = $('[data-gate-form]');
  const input = $('[data-gate-input]');
  const err = $('[data-gate-error]');
  const btn = $('[data-gate-submit]');
  d.addEventListener('cancel', (e) => e.preventDefault()); // family only: Esc doesn't skip it
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!input.value.trim()) { err.textContent = 'Type the passcode first.'; input.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Checking…';
    let result = null;
    try {
      result = await unlockWithPasscode(input.value, SECRETS);
    } catch {
      err.textContent = "This browser can't open the lock. Try updating it, or open the link in Safari or Chrome.";
    }
    btn.disabled = false;
    btn.textContent = 'Open the postcard';
    if (!result) {
      if (!err.textContent) err.textContent = "Hmm, that's not it. Check the text from Cooper and try again.";
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      input.select();
      return;
    }
    store.set(KEY_STORE, result.keyB64);
    state.unlocked = { phone: result.phone };
    input.value = '';
    d.close();
    document.body.classList.add('unlocked');
    if (state.pendingChip) {
      const id = state.pendingChip;
      state.pendingChip = null;
      openChip(id);
    }
  });
}

/* ---------- Chip-in modal ---------- */

const modal = () => $('#chip-modal');

function tripName(id) {
  if (id === 'general') return null;
  return state.data.trips.find((t) => t.id === id)?.name ?? null;
}

function currentAmount() {
  const form = $('[data-chip-form]');
  const choice = form.amount.value;
  if (choice === 'custom') return parseAmount(form.custom.value);
  return parseAmount(choice);
}

function updatePreview() {
  const form = $('[data-chip-form]');
  const name = form.name.value.trim() || '…';
  const amount = currentAmount();
  $('[data-custom-wrap]').hidden = form.amount.value !== 'custom';
  $('[data-preview]').textContent = buildMessage({ name, amount: amount ?? 0, tripName: tripName(form.trip.value) })
    .replace('$0 ', '$… ');
}

function showStep(step) {
  for (const el of $$('[data-step]', modal())) el.hidden = el.dataset.step !== step;
  const focusEl = step === 'form' ? $('[data-chip-form] [name=name]') : $(`[data-step="${step}"] .modal-title`, modal());
  focusEl?.focus();
}

function openChip(id) {
  state.lastOpener = document.activeElement;
  if (!state.unlocked) {
    state.pendingChip = id;
    showGate();
    return;
  }
  const form = $('[data-chip-form]');
  const sel = $('[data-trip-select]');
  const trips = [...state.data.trips].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  sel.innerHTML = `<option value="general">The general fund</option>` +
    trips.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}${state.alloc.trips[t.id].funded ? ' (already funded!)' : ''}</option>`).join('');
  sel.value = id;
  form.name.value = store.get(NAME_STORE) || '';
  $('[data-chip-error]').textContent = '';
  $('[data-send-label]').textContent = state.platform === 'desktop' ? 'Get the message' : 'Open my texts';
  updatePreview();
  showStep('form');
  modal().showModal();
  (form.name.value ? $('[data-send-label]') : form.name).focus();
}

function closeChip() {
  modal().close();
}

function showThanks(amount) {
  const phone = formatPhone(state.unlocked.phone);
  const num = Object.assign(document.createElement('span'), { className: 'nowrap', textContent: phone });
  $('[data-thanks-text]').replaceChildren(
    `Send the ${formatAmount(amount)} via Zelle to `, num,
    '. Your bar will fill once it lands — Cooper updates it by hand, so give it a day or two.',
  );
  $('[data-phone-status]').textContent = '';
  showStep('thanks');
}

async function copyText(text, textarea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts.
    const ta = textarea || Object.assign(document.createElement('textarea'), { value: text });
    if (!textarea) { ta.style.position = 'fixed'; ta.style.opacity = '0'; modal().appendChild(ta); }
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    if (!textarea) ta.remove();
    return ok;
  }
}

function wireChip() {
  const d = modal();
  const form = $('[data-chip-form]');
  let lastAmount = 0;
  let lastMessage = '';

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', (e) => {
    updatePreview();
    if (e.target.name === 'amount' && e.target.value === 'custom') $('[data-custom-input]').focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-chip-error]');
    const name = form.name.value.trim();
    const amount = currentAmount();
    if (!name) { err.textContent = 'Add your name so Cooper knows who to thank.'; form.name.focus(); return; }
    if (amount == null) { err.textContent = 'Pick an amount, or type one between $1 and $10,000.'; (form.amount.value === 'custom' ? form.custom : form.amount[0]).focus(); return; }
    err.textContent = '';
    store.set(NAME_STORE, name);
    lastAmount = amount;
    lastMessage = buildMessage({ name, amount, tripName: tripName(form.trip.value) });

    if (state.platform === 'desktop') {
      $('[data-phone-text]').textContent = formatPhone(state.unlocked.phone);
      $('[data-copy-text]').value = lastMessage;
      $('[data-copy-status]').textContent = '';
      $('[data-sms-again-wrap]').hidden = true;
      showStep('copy');
    } else {
      const link = buildSmsLink(state.platform, state.unlocked.phone, lastMessage);
      $('[data-sms-again]').href = link;
      $('[data-sms-again-wrap]').hidden = false;
      window.location.href = link;
      showThanks(amount);
    }
  });

  $('[data-copy]').addEventListener('click', async () => {
    const ok = await copyText(lastMessage, $('[data-copy-text]'));
    if (ok) showThanks(lastAmount);
    else $('[data-copy-status]').textContent = "Couldn't copy automatically. Select the message above and copy it by hand.";
  });
  $('[data-back]').addEventListener('click', () => showStep('form'));
  $('[data-copy-phone]').addEventListener('click', async () => {
    const ok = await copyText(state.unlocked.phone.replace(/^\+1/, ''));
    $('[data-phone-status]').textContent = ok ? 'Number copied.' : "Couldn't copy. It's the number above.";
  });

  $$('[data-close]', d).forEach((b) => b.addEventListener('click', closeChip));
  d.addEventListener('click', (e) => { if (e.target === d) closeChip(); }); // backdrop
  d.addEventListener('close', () => state.lastOpener?.focus?.({ preventScroll: true }));
}

// Belt and braces: keep Tab inside whichever modal is open (showModal already makes the page inert).
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const d = [gate(), modal()].find((x) => x.open);
  if (!d) return;
  const f = $$('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', d)
    .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !d.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- Boot ---------- */

function wireToolbar() {
  $$('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    applyFilterSort();
  }));
  const sortBtn = $('[data-sort]');
  sortBtn.addEventListener('click', () => {
    state.sortAsc = !state.sortAsc;
    sortBtn.textContent = state.sortAsc ? 'Soonest first ↓' : 'Latest first ↑';
    sortBtn.setAttribute('aria-label', `Sort order: ${state.sortAsc ? 'soonest' : 'latest'} first. Tap to reverse.`);
    applyFilterSort();
  });
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) openChip(chip.dataset.chip);
  });
}

async function main() {
  document.documentElement.classList.toggle('reduced-motion', reducedMotion());
  renderCountdown();
  wireToolbar();
  wireGate();
  wireChip();
  document.addEventListener('keydown', trapFocus);

  const unlockP = tryRememberedKey().then((ok) => {
    if (ok) document.body.classList.add('unlocked');
    else showGate();
  });

  try {
    state.data = await loadData();
    state.alloc = allocate(state.data.trips, state.data.generalFund);
    renderOverview();
    renderTrips();
    renderPostcards();
  } catch (err) {
    console.error(err);
    $('[data-trip-grid]').innerHTML = '<li class="loading">The postcards got lost in the mail. Try refreshing the page.</li>';
  }
  await unlockP;
}

main();
