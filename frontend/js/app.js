/* Label Printer — lay labels out multi-up on A4 and print them true size.
   Pure client-side, no build step. Settings persist in localStorage. */
'use strict';

const PAGE_W = 210, PAGE_H = 297, MARGIN = 6; // A4 + safe margin, mm
const SAFE = 3;                                // bottom margin hidden by the bin-slot lip, mm
const SLOT = 10;                               // side tab each side that seats into the slot, mm
const BARW = SLOT + 4;                         // colour-bar width: the slot tab + a visible strip, mm
const PX_PER_MM = 96 / 25.4;                   // CSS reference (1in = 96px = 25.4mm)
const STORE = 'label-printer/v1';

const SEED = [
  'C13–C14 1.8m blue',
  'C13–C14 1.8m black https://www.fs.com/au/products/142006.html',
  'CAT6A 2m',
  'Keystone CAT6A green',
  'LC–LC OM4 Keystone',
  'SFP-10G-SR | MMF',
  'GLC-T | RJ45',
  'QSFP-100G DAC 1m',
  'Cage nuts M6×20',
];

// Category families — colour, label, and the keywords that auto-assign them.
const FAMILIES = {
  power:    { label: 'POWER',    color: '#C2571C' }, // amber — mains
  copper:   { label: 'COPPER',   color: '#1F6FEB' }, // blue — RJ45
  fibre:    { label: 'FIBRE',    color: '#00A7C4' }, // aqua — OM3/OM4 jackets
  sfp:      { label: 'SFP',      color: '#6D4FC4' }, // violet — transceivers
  dac:      { label: 'DAC',      color: '#C0398B' }, // magenta — twinax / direct-attach
  hardware: { label: 'HARDWARE', color: '#5A767C' }, // slate — not a cable
};

// Guess the family from the label text. Order matters: DAC and SFP are checked
// before fibre/copper (an SFP/QSFP module mentions LC/RJ45 but is still an
// optic/twinax), and copper before power so "CAT6A" doesn't trip the C-rule.
function classify(line){
  const t = line.toLowerCase();
  if (/\b(dac|twinax|aoc)\b|passive copper|\bcu\d|\d+g-cu/.test(t)) return 'dac';
  if (/\b(sfp|sfp\+|sfp28|qsfp|qsfp28|xfp|gbic|cfp|glc)\b|transceiver|\d*gbase|1000base/.test(t)) return 'sfp';
  if (/\b(lc|sc|fc|st|mpo|mtp)\b|\bom[1-5]\b|\bos2\b|fib(re|er)|multimode|single ?mode/.test(t)) return 'fibre';
  if (/\bcat\s?[0-9]/.test(t) || /rj-?45|keystone|\butp\b|\bstp\b|ethernet/.test(t)) return 'copper';
  if (/\bc\d{1,2}\b|\biec\b|\bgpo\b|mains|kettle|\bpdu\b|figure-?8|wall ?plug|power ?lead|\bplug\b/.test(t)) return 'power';
  return 'hardware';
}

// Physical item colour, shown as a swatch dot (for "the black keystone" vs the
// green one, blue vs black IEC leads, …). Detected as a trailing colour word.
const SWATCH = {
  black: '#1b1b1b', white: '#ffffff', grey: '#8a9aa0', gray: '#8a9aa0', silver: '#c4ccce',
  red: '#d12f3a', orange: '#e8821e', yellow: '#f1c40f', green: '#2e9e5b',
  blue: '#2563eb', purple: '#7c3aed', violet: '#7c3aed', pink: '#e0529c', brown: '#8a5a2b',
};
function popColour(primary){
  const m = primary.match(/\s([a-z]+)\s*$/i);
  if (m){
    const name = m[1].toLowerCase();
    const head = primary.slice(0, m.index).trim();
    if (SWATCH[name] && head) return { primary: head, colour: SWATCH[name] };
  }
  return { primary, colour: '' };
}

// Form-factor descriptor words → shown small (the spec is the headline). e.g.
// "Keystone CAT6A" → kind "Keystone", type "CAT6A"; "LC–LC OM4 Keystone" → type "LC–LC OM4".
const DESCRIPTORS = /\b(keystone|coupler|adapter|faceplate|gland|pigtail|breakout)\b/i;
function popKind(primary){
  const m = primary.match(DESCRIPTORS);
  if (m){
    const rest = (primary.slice(0, m.index) + primary.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
    if (rest) return { primary: rest, kind: m[0] };
  }
  return { primary, kind: '' };
}

const $ = id => document.getElementById(id);
const el = {
  labels: $('labels'), w: $('w'), h: $('h'), bleed: $('bleed'), copies: $('copies'),
  mono: $('mono'), bold: $('bold'), upper: $('upper'), border: $('border'), marks: $('marks'),
  sheets: $('sheets'), count: $('count'), perPage: $('perPage'),
  zoomLabel: $('zoomLabel'), stage: $('stage'),
};

let zoom = null;      // null = fit-to-window
let calibrate = false; // true = show the printer-calibration ruler instead of labels

/* ---------- state ---------- */
function readState(){
  return {
    text: el.labels.value,
    w: clamp(+el.w.value || 96, 10, 200),
    h: clamp(+el.h.value || 34, 10, 287),
    bleed: clamp(+el.bleed.value || 0, 0, 10),
    copies: clamp(+el.copies.value || 1, 1, 200),
    mono: el.mono.checked, bold: el.bold.checked, upper: el.upper.checked,
    border: el.border.checked, marks: el.marks.checked,
  };
}
function applyState(s){
  el.labels.value = s.text ?? SEED.join('\n');
  el.w.value = s.w ?? 96; el.h.value = s.h ?? 34;
  el.bleed.value = s.bleed ?? 3; el.copies.value = s.copies ?? 1;
  el.mono.checked = !!s.mono; el.bold.checked = s.bold !== false;
  el.upper.checked = !!s.upper; el.border.checked = !!s.border;
  el.marks.checked = s.marks !== false;
}
function save(s){ try{ localStorage.setItem(STORE, JSON.stringify(s)); }catch(e){} }
function load(){ try{ return JSON.parse(localStorage.getItem(STORE)); }catch(e){ return null; } }

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ---------- parse ---------- */
// One label per line. The family (colour) is auto-detected; a metre length like
// "1.8m" is pulled out to the chip. Force a chip yourself with "primary | chip".
function parseLine(line){
  // a URL anywhere on the line becomes a QR code (and is removed from the text)
  let qr = '';
  const um = line.match(/\bhttps?:\/\/\S+/i);
  if (um){
    qr = um[0];
    line = (line.slice(0, um.index) + line.slice(um.index + um[0].length)).replace(/\s{2,}/g, ' ').trim();
  }
  const fam = classify(line);
  let primary = line, chip = '';
  const bar = line.indexOf('|');
  if (bar !== -1){
    primary = line.slice(0, bar).trim();
    chip = line.slice(bar + 1).trim();
  } else {
    if (fam !== 'sfp'){
      // a length in metres (e.g. 1.8m / 2 m / 3m) — but not "20mm", "OM4", "MTP",
      // nor a number glued to letters like "CU1M" (a part number, not a length).
      // Skipped for SFPs so a transceiver's reach ("300m") isn't read as a length.
      const m = primary.match(/(?<![a-z])(\d+(?:\.\d+)?)\s*m(?![a-z])/i);
      if (m){
        chip = m[1] + ' m';
        primary = (primary.slice(0, m.index) + primary.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim() || primary;
      }
    }
    if (!chip){
      // a fastener size like M6 or M6×20mm → chip (cage nuts, screws). "\bM\d"
      // can't catch the M in "OM4"/"MMF" (no word boundary / no digit).
      const fm = primary.match(/\bM\d+(?:\s?[×x]\s?\d+)?(?:\s?mm)?\b/i);
      if (fm){
        chip = fm[0].replace(/\s|mm/gi, '');
        primary = (primary.slice(0, fm.index) + primary.slice(fm.index + fm[0].length)).replace(/\s{2,}/g, ' ').trim() || primary;
      }
    }
  }
  const c = popColour(primary);
  const k = popKind(c.primary);
  return { primary: k.primary, chip, fam, colour: c.colour, qr, kind: k.kind };
}
function parseLabels(text){
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(parseLine);
}

// Render a payload as a crisp SVG QR (scales for print). Quiet zone = 4 modules,
// medium error correction. Returns '' if the library didn't load.
function qrSvg(text){
  if (typeof qrcode === 'undefined') return '';
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 4, s = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(r, col)) d += `M${col + q} ${r + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
         `<rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

/* ---------- render ---------- */
function render(){
  const s = readState();
  save(s);

  const bleed = s.bleed, gap = Math.max(2, bleed * 2);
  // The entered width/height ARE the printed/cut size (true size). The full-bleed colour
  // bars (each with a ~SLOT-wide tab that seats into the holder) live inside that size.
  const trimW = s.w;
  const cellW = trimW + bleed * 2, cellH = s.h + bleed * 2;

  if (calibrate){ renderCalibration(s, trimW); return; }
  const cols = Math.max(1, Math.floor((PAGE_W - 2 * MARGIN + gap) / (cellW + gap)));
  const rows = Math.max(1, Math.floor((PAGE_H - 2 * MARGIN + gap) / (cellH + gap)));
  const per = cols * rows;

  let items = [];
  for (const lab of parseLabels(s.text))
    for (let c = 0; c < s.copies; c++) items.push(lab);

  el.count.textContent = items.length ? `${items.length} label${items.length === 1 ? '' : 's'}` : '';
  el.perPage.textContent = `${cols}×${rows} = ${per} / sheet`;

  el.sheets.style.setProperty('--zoom', fitZoom());
  el.sheets.innerHTML = '';

  if (!items.length){
    el.sheets.innerHTML = '<div class="empty">Type some labels on the left to see them here.</div>';
    return;
  }

  const pages = Math.ceil(items.length / per);
  const typeCls = ['sc-type', s.mono ? 'mono' : '', s.bold ? '' : 'thin', s.upper ? 'upper' : '']
    .filter(Boolean).join(' ');

  for (let p = 0; p < pages; p++){
    const frame = document.createElement('div');
    frame.className = 'sheet-frame';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.style.cssText =
      `--margin:${MARGIN}mm;--cellw:${cellW}mm;--cellh:${cellH}mm;--bleed:${bleed}mm;` +
      `--mark:${Math.max(2, bleed)}mm;--safe:${SAFE}mm;--qr:${(s.h * 0.6).toFixed(2)}mm;--barw:${BARW}mm;` +
      `grid-template-columns:repeat(${cols},var(--cellw));gap:${gap}mm;`;

    for (const lab of items.slice(p * per, p * per + per)){
      const cell = document.createElement('div');
      cell.className = 'cell';

      const label = document.createElement('div');
      label.className = 'lbl' + (s.border ? ' bordered' : '');
      const F = FAMILIES[lab.fam];

      const barEl = document.createElement('div');
      barEl.className = 'sc-bar';
      barEl.style.background = F.color;

      // main: headline (vertically centred) + bottom-left meta (descriptor · family)
      const main = document.createElement('div');
      main.className = 'sc-main';
      const tbox = document.createElement('div');
      tbox.className = 'sc-typebox';
      const type = document.createElement('div');
      type.className = typeCls;
      type.textContent = lab.primary;
      tbox.appendChild(type);
      main.appendChild(tbox);

      if (lab.kind){
        // descriptor (Keystone, Coupler…) as an eyebrow above the headline
        const kicker = document.createElement('div');
        kicker.className = 'sc-kicker';
        kicker.textContent = lab.kind;
        main.appendChild(kicker);
      }
      const meta = document.createElement('div');
      meta.className = 'sc-meta';
      const fam = document.createElement('div');
      fam.className = 'sc-fam';
      fam.textContent = F.label;
      fam.style.color = F.color;
      meta.appendChild(fam);
      main.appendChild(meta);

      label.appendChild(barEl);
      label.appendChild(main);

      // size/spec — strong secondary anchor, pinned right on the headline's eye-line
      if (lab.chip){
        const size = document.createElement('div');
        size.className = 'sc-size';
        size.textContent = lab.chip;
        label.appendChild(size);
      }
      if (lab.qr){
        const q = document.createElement('div');
        q.className = 'sc-qr';
        q.innerHTML = qrSvg(lab.qr);
        label.appendChild(q);
      }
      if (lab.colour){
        // item (jacket) colour — a full-height stripe on the right edge,
        // mirroring the family bar on the left (bar = what it is, stripe = which colour)
        const stripe = document.createElement('div');
        stripe.className = 'sc-stripe';
        stripe.style.background = lab.colour;
        label.appendChild(stripe);
      }
      cell.appendChild(label);

      if (s.marks){
        const cut = document.createElement('div');
        cut.className = 'cut';
        cell.appendChild(cut);
        for (const c of ['tl', 'tr', 'bl', 'br']){
          const m = document.createElement('span');
          m.className = 'mk ' + c;
          cell.appendChild(m);
        }
      }
      sheet.appendChild(cell);
    }

    if (pages > 1){
      const tag = document.createElement('div');
      tag.className = 'pagetag';
      tag.textContent = `${p + 1} / ${pages}`;
      sheet.appendChild(tag);
    }
    frame.appendChild(sheet);
    el.sheets.appendChild(frame);
  }

  // auto-fit every code into its box (measured at true mm; transform doesn't affect layout px)
  requestAnimationFrame(() => el.sheets.querySelectorAll('.sc-typebox').forEach(fitText));
}

// shrink/grow font so the headline fills its box — but cap it so short codes
// (CAT6A, GLC-T) don't balloon and dwarf the size. Cap ≈ 0.26 × label height.
function fitText(box){
  const code = box.firstElementChild;
  const maxW = box.clientWidth, maxH = box.clientHeight;
  if (!maxW || !maxH) return;
  const lbl = box.closest('.lbl');
  const cap = lbl ? lbl.clientHeight * 0.26 : Infinity;
  let lo = 4, hi = Math.min(Math.ceil(maxH) + 4, cap); // px; height/cap is the hard ceiling
  for (let i = 0; i < 14; i++){
    const mid = (lo + hi) / 2;
    code.style.fontSize = mid + 'px';
    if (code.scrollWidth <= maxW + 0.5 && code.scrollHeight <= maxH + 0.5) lo = mid;
    else hi = mid;
  }
  code.style.fontSize = lo.toFixed(2) + 'px';
}

/* ---------- calibration ruler ---------- */
// A true-mm 100×40 box with graduations on all four edges (SVG, so it prints as
// foreground without needing "Background graphics"). Print it, measure with a ruler,
// and adjust the printer's scale until it reads 100×40 mm.
function rulerSvg(){
  const W = 100, H = 40, pad = 13, x0 = pad, y0 = pad, x1 = x0 + W, y1 = y0 + H;
  const sw = W + pad * 2, sh = H + pad * 2;
  const tick = n => n % 10 ? (n % 5 ? 1.6 : 2.8) : 4.6;   // minor / mid / major length
  const swid = n => n % 10 ? 0.18 : 0.32;
  let lines = '', nums = '';
  for (let x = 0; x <= W; x++){
    const X = x0 + x, L = tick(x), w = swid(x);
    lines += `<line x1="${X}" y1="${y0}" x2="${X}" y2="${y0 - L}" stroke-width="${w}"/>`;   // top
    lines += `<line x1="${X}" y1="${y1}" x2="${X}" y2="${y1 + L}" stroke-width="${w}"/>`;   // bottom
    if (!(x % 10)) nums += `<text x="${X}" y="${y0 - 5.9}" text-anchor="middle">${x}</text>`;
  }
  for (let y = 0; y <= H; y++){
    const Y = y0 + y, L = tick(y), w = swid(y);
    lines += `<line x1="${x0}" y1="${Y}" x2="${x0 - L}" y2="${Y}" stroke-width="${w}"/>`;   // left
    lines += `<line x1="${x1}" y1="${Y}" x2="${x1 + L}" y2="${Y}" stroke-width="${w}"/>`;   // right
    if (!(y % 10)) nums += `<text x="${x0 - 5.9}" y="${Y + 1}" text-anchor="end">${y}</text>`;
  }
  lines += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="none" stroke-width="0.32"/>`;
  return `<svg viewBox="0 0 ${sw} ${sh}" width="${sw}mm" height="${sh}mm" ` +
    `font-family="'Plus Jakarta Sans',sans-serif" xmlns="http://www.w3.org/2000/svg">` +
    `<g shape-rendering="crispEdges" stroke="#33474d">${lines}</g>` +
    `<g fill="#0c2a30" font-size="3">${nums}</g>` +
    `<text x="${x0 + W / 2}" y="${y1 + 9.5}" fill="#0c2a30" font-size="4.6" font-weight="700" text-anchor="middle">100 mm</text>` +
    `<text x="${x1 + 9}" y="${y0 + H / 2}" fill="#0c2a30" font-size="4.6" font-weight="700" text-anchor="middle" transform="rotate(90 ${x1 + 9} ${y0 + H / 2})">40 mm</text>` +
    `</svg>`;
}

function renderCalibration(s, trimW){
  el.count.textContent = '';
  el.perPage.textContent = 'ruler';
  el.sheets.style.setProperty('--zoom', fitZoom());
  el.sheets.innerHTML = '';
  const frame = document.createElement('div');
  frame.className = 'sheet-frame';
  const sheet = document.createElement('div');
  sheet.className = 'sheet cal-sheet';
  sheet.style.cssText = `--margin:${MARGIN}mm;`;
  const cal = document.createElement('div');
  cal.className = 'cal';
  cal.innerHTML =
    `<div class="cal-title">Printer calibration</div>` +
    rulerSvg() +
    `<div class="cal-note">Print at <b>A4</b>, <b>Margins: None</b>, <b>Scale 100%</b> (Fit-to-page off).` +
    ` Then measure with a ruler — the box should be exactly <b>100&nbsp;×&nbsp;40&nbsp;mm</b>.` +
    ` If it's off, set the printer scale to <b>100&nbsp;÷&nbsp;measured&nbsp;width</b>` +
    ` (e.g. 96&nbsp;mm&nbsp;→&nbsp;~104%) and reprint to confirm.<br>` +
    `Your labels print at <b>${trimW}&nbsp;×&nbsp;${s.h}&nbsp;mm</b> — true size` +
    ` (the colour bars include a ~${SLOT}&nbsp;mm slot tab each side, within that width).</div>`;
  sheet.appendChild(cal);
  frame.appendChild(sheet);
  el.sheets.appendChild(frame);
}

/* ---------- zoom ---------- */
function fitZoom(){
  if (zoom) return zoom;
  const avail = el.stage.clientWidth - 60; // padding allowance
  return clamp(avail / (PAGE_W * PX_PER_MM), 0.15, 1);
}
function setZoom(z){
  zoom = z;
  el.zoomLabel.textContent = z ? Math.round(z * 100) + '%' : 'Fit';
  el.sheets.style.setProperty('--zoom', fitZoom());
  // re-fit text (clientWidth is layout px, unaffected by scale — but cheap to redo)
  requestAnimationFrame(() => el.sheets.querySelectorAll('.sc-typebox').forEach(fitText));
}

/* ---------- wire up ---------- */
function init(){
  const saved = load();
  applyState(saved || { text: SEED.join('\n') });

  const inputs = [el.labels, el.w, el.h, el.bleed, el.copies,
                  el.mono, el.bold, el.upper, el.border, el.marks];
  inputs.forEach(i => i.addEventListener('input', render));

  $('seedBtn').addEventListener('click', () => {
    const cur = el.labels.value.trim();
    el.labels.value = (cur ? cur + '\n' : '') + SEED.join('\n');
    render();
  });
  $('clearBtn').addEventListener('click', () => { el.labels.value = ''; el.labels.focus(); render(); });
  $('swapBtn').addEventListener('click', () => {
    const w = el.w.value; el.w.value = el.h.value; el.h.value = w; render();
  });

  $('calBtn').addEventListener('click', () => {
    calibrate = !calibrate;
    $('calBtn').classList.toggle('active', calibrate);
    render();
  });
  $('printBtn').addEventListener('click', () => window.print());
  $('zoomIn').addEventListener('click', () => setZoom(clamp((fitZoom()) + 0.1, 0.15, 1.5)));
  $('zoomOut').addEventListener('click', () => setZoom(clamp((fitZoom()) - 0.1, 0.15, 1.5)));
  $('zoomFit').addEventListener('click', () => setZoom(null));

  let rt;
  window.addEventListener('resize', () => { if (!zoom){ clearTimeout(rt); rt = setTimeout(() => setZoom(null), 120); } });

  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
}

init();
