/* Lux VIN scanner: on-device OCR (vendored Tesseract.js 5) + barcode (BarcodeDetector / vendored ZXing), all same-origin.
   No SharedArrayBuffer / COOP-COEP needed (Tesseract.js runs single-threaded wasm in a Web Worker). */
(function (g) {
'use strict';
const VS = {};
const BASE = (document.currentScript && document.currentScript.src.replace(/[^\/]*$/, '')) || './';
VS.cfg = { model: (/[?&]ocrmodel=(fast|best_int)/.exec(location.search) || [])[1] || 'fast', tessBase: BASE + 'vendor/tesseract/', zxing: BASE + 'vendor/zxing-library-0.21.3.min.js', ocrGapMs: 250, barcodeGapMs: 350,
  cloud: (/[?&]ocrurl=([^&]+)/.exec(location.search) || [])[1] ? decodeURIComponent(/[?&]ocrurl=([^&]+)/.exec(location.search)[1]) : 'https://lux-check-inventory.luxrepair2025.workers.dev/vin-ocr',
  cloudMaxEdge: 1600, cloudQuality: 0.85, cloudTimeoutMs: 20000 };
const WL = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
// ---------------- VIN logic ----------------
const TR = {}; '0123456789'.split('').forEach((c, i) => TR[c] = i); 'ABCDEFGH'.split('').forEach((c, i) => TR[c] = i + 1);
'JKLMN'.split('').forEach((c, i) => TR[c] = i + 1); TR.P = 7; TR.R = 9; 'STUVWXYZ'.split('').forEach((c, i) => TR[c] = i + 2);
const WT = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
VS.checkDigit = v => { if (!VIN_RE.test(v)) return false; let s = 0; for (let i = 0; i < 17; i++) s += TR[v[i]] * WT[i]; s %= 11; return (s == 10 ? 'X' : String(s)) == v[8]; };
VS.isNA = v => /^[1-5]/.test(v);   // North America: check digit is mandatory
const TO_DIGIT = { S: '5', B: '8', Z: '2', G: '6', D: '0', O: '0', Q: '0', I: '1', L: '1', T: '7', A: '4' };
const SWAP = { S: '5', '5': 'S', B: '8', '8': 'B', Z: '2', '2': 'Z', G: '6', '6': 'G', T: '7', '7': 'T', A: '4', '4': 'A' };
const WSWAP = Object.assign({ D: '0', '0': 'D', L: '1', '1': 'L', N: 'M', M: 'N', W: 'V', V: 'W', F: 'E', E: 'F', K: 'X', X: 'K' }, SWAP);  // for the 3-char manufacturer code only
// common WMIs (first 3 chars; 2-char prefixes end with '*') for makes seen at US auctions; a known WMI lets a read be accepted at once
const WMI = new Set(('5YJ 7SA 7G2 LRW XP7 7SX 1F* 2F* 3F* NM0 1G* 2G* 3G* KL* 1C* 2C* 3C* 1J* 3D* 1D* 1B* 2B* 1H* 2H* 5F* 5J* JH* 19X 19U 4S* JT* 4T* 5T* 2T* 3T* 58A JN* 1N* 3N* 5N* 4N* KM* KN* 5X* 5NM 5NP 3KP '
 + 'WDD WDB WDC WDF W1K W1N W1V W1W W1X W1Y 4JG 55S WBA WBS WBX WBY 5UX 5UJ 5YM 4US WP0 WP1 WAU WA1 WUA WVW WVG 1VW 3VW SAL SAJ SAD SCB SCA SCF ZFF ZHW ZAM ZAR ZFA 3MZ JM* JF* 4S3 YV1 YV4 LYV 7JR '
 + 'JA* 4A* JK* 1L* 2L* 5L* 1M* 1Z* 4M* 3VV 1YV 2HK 2HG 2HJ 5FN 5FP 1GT 1GC 1GN 1GK 3GN 3GK SHH SJN TRU WF0 VF* VR* VS* VW* ZCF U5Y KND KNA KNM 7FA 7MM 7MU 7PD 1RN 5RN 7YA').split(' '));
VS.knownWmi = v => WMI.has(v.slice(0, 3)) || WMI.has(v.slice(0, 2) + '*');
const YEAR = /[A-HJ-NPR-TV-Y1-9]/;
VS.clean = s => String(s || '').toUpperCase().replace(/O|Q/g, '0').replace(/I/g, '1').replace(/[^A-Z0-9]/g, '');
function fixPositions(c) {  // position 9 (check digit: 0-9/X) and 13-17 (serial, numeric) -> digits
  const a = c.split(''); let n = 0;
  if (!/[0-9X]/.test(a[8]) && TO_DIGIT[a[8]]) { a[8] = TO_DIGIT[a[8]]; n++; }
  for (let i = 12; i < 17; i++) if (/[A-Z]/.test(a[i]) && TO_DIGIT[a[i]]) { a[i] = TO_DIGIT[a[i]]; n++; }
  return [a.join(''), n];
}
function shapeOk(v) {  // structural sanity: year char, numeric serial tail, letter/digit mix
  if (!VIN_RE.test(v) || !YEAR.test(v[9]) || !/^[0-9]{3}$/.test(v.slice(14))) return false;
  const d = (v.match(/[0-9]/g) || []).length; return d >= 4 && d <= 14;
}
function repairs(c) {  // up to 2 OCR-confusion swaps that make the check digit valid
  const pos = []; for (let i = 0; i < 17; i++) if (SWAP[c[i]] && !(i >= 12 && /[A-Z]/.test(SWAP[c[i]]))) pos.push(i);
  const out = []; const sw = (s, i) => s.slice(0, i) + SWAP[s[i]] + s.slice(i + 1);
  for (const i of pos) { const v = sw(c, i); if (VS.checkDigit(v) && shapeOk(v)) out.push([v, 1]); }
  for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) { const v = sw(sw(c, pos[a]), pos[b]); if (VS.checkDigit(v) && shapeOk(v)) out.push([v, 2]); }
  return out;
}
/** candidate strings: groups of consecutive whitespace-separated tokens on ONE line whose cleaned length is 17-19
 *  (a VIN printed alone or in 2-4 groups, plus at most 2 stray characters at the ends). Never spans unrelated text. */
function candidates(text) {
  const out = [];
  for (let line of String(text || '').toUpperCase().split(/\n+/)) {
    line = line.replace(/\bV\.?\s?[I1L]?\.?\s?N\.?\s*(N[O0]\.?|#)?\s*[:.\-]?(?=\s|[0-9A-Z]{17})/g, ' ');
    const toks = line.split(/[\s:;,|]+/).map(VS.clean).filter(Boolean);
    for (let i = 0; i < toks.length; i++) { let s = '';
      for (let j = i; j < Math.min(toks.length, i + 5); j++) { s += toks[j]; if (s.length > 19) break;
        if (s.length == 17) out.push(s);                                                     // exact 17-char group: strong
        else if (s.length > 17) { for (let k = 0; k + 17 <= s.length; k++) out.push('+' + s.substr(k, 17));   // window of a longer group: weak
          if (s.length == 18) for (let k = 1; k < 17; k++) out.push('~' + s.slice(0, k) + s.slice(k + 1)); } } }  // one stray char inside: weak
  }
  return [...new Set(out)];
}
function wmiFix(v) {  // make the manufacturer code a known one with up to 2 look-alike swaps in the first 3 chars
  if (VS.knownWmi(v)) return [[v, 0]];
  const out = [];
  for (let m = 1; m < 8; m++) { const a = v.split(''); let ok = true, n = 0;
    for (let i = 0; i < 3; i++) if (m & (1 << i)) { if (!WSWAP[a[i]]) { ok = false; break; } a[i] = WSWAP[a[i]]; n++; }
    if (ok && n <= 2) { const w = a.join(''); if (VS.knownWmi(w)) out.push([w, n]); } }
  return out;
}
/** all interpretations of one OCR text: [{vin, valid, known, edits, repaired}] */
VS.reads = function (text) {
  const res = []; const add = (v, edits, repaired) => { if (shapeOk(v)) res.push({ vin: v, valid: VS.checkDigit(v), known: VS.knownWmi(v), edits, repaired }); };
  for (let w of candidates(text)) {
    const weak = w[0] == '~' || w[0] == '+'; if (weak) w = w.slice(1);
    const [f, n0] = fixPositions(w), n = n0 + (weak ? 1 : 0); add(w, weak ? 1 : 0, weak); if (f != w) add(f, n, weak);
    for (const [g, m] of wmiFix(f)) { if (m) add(g, n + m, false);
      if (!VS.checkDigit(g) && VS.isNA(g)) for (const [v, e] of repairs(g)) add(v, n + m + e, true); }  // swaps to satisfy the check digit: North-American VINs only
  }
  return res;
};
VS.strict = x => x.valid && x.known && !x.ambiguous && !x.repaired && x.edits <= 1;
const rank = x => (x.valid && x.known ? 8 : 0) + (x.valid && VS.isNA(x.vin) && !x.repaired ? 2 : 0) + (x.known ? 2 : 0) - x.edits * (x.repaired ? 1.5 : 0.7);
VS.findVin = function (text) {
  const r = VS.reads(text); if (!r.length) return null;
  r.sort((a, b) => rank(b) - rank(a)); const top = r[0];
  if (top.valid && r.some(x => x.vin != top.vin && x.valid && x.known == top.known && x.edits == top.edits)) top.ambiguous = true;
  return top;
};
/** per-position majority over several 17-char reads (different frames / preprocessings) */
VS.consensus = function (vins) {
  if (vins.length < 3) return null; const out = [];
  for (let i = 0; i < 17; i++) { const c = {}; for (const v of vins) c[v[i]] = (c[v[i]] || 0) + 1; const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; out.push(best[0]); }
  const v = out.join(''); return shapeOk(v) ? { vin: v, valid: VS.checkDigit(v), known: VS.knownWmi(v), edits: 0, consensus: vins.length } : null;
};
/** stability vote for live frames. A single frame is never enough: over many frames a misread passes the check digit by
 *  chance (~1 in 11). The same VIN must come out of DIFFERENT readings (layout mode / threshold / polarity), because a
 *  steady camera repeats the same misread with the same settings. tag = how the frame was read. */
VS.Voter = function () { const h = []; return { add(r, tag) {
  h.push({ vin: r ? r.vin : null, tag: tag || '', clean: !!(r && !r.repaired) }); if (h.length > 8) h.shift();
  const c = VS.consensus(h.filter(x => x.clean).map(x => x.vin));                    // character vote over the last 3-8 clean reads
  if (c && c.valid && c.known && new Set(h.filter(x => x.clean).map(x => x.tag)).size >= 2 && h.filter(x => x.vin == c.vin).length >= 2) return Object.assign(c, { stable: true, unsure: false });
  if (!r) return null;
  const same = h.filter(x => x.vin == r.vin), tags = new Set(same.map(x => x.tag)).size;
  const need = VS.strict(r) ? [2, 2] : (r.valid && r.known && !r.repaired) ? [3, 2] : r.valid ? [4, 3] : [5, 3];   // [frames, distinct readings]
  return same.length >= need[0] && tags >= need[1] ? Object.assign({}, r, { stable: true, unsure: !VS.strict(r) }) : null; },
  reset() { h.length = 0; } }; };
VS.fromBarcode = function (t) {
  t = String(t || '').toUpperCase(); const c = t.replace(/[^A-Z0-9]/g, '');
  if (c.length == 18 && c[0] == 'I' && VIN_RE.test(c.slice(1))) return c.slice(1);
  const m = t.match(/[A-HJ-NPR-Z0-9]{17}/g) || c.match(/[A-HJ-NPR-Z0-9]{17}/g); if (!m) return null; return m.find(VS.checkDigit) || m[0];
};
// ---------------- loaders ----------------
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src)); document.head.appendChild(s); }); }
let zxP = null; const TW = {}, PSM = {};
VS.ocr = function (model) {
  model = model || VS.cfg.model;
  return TW[model] || (TW[model] = (async () => {
    if (!g.Tesseract) await loadScript(VS.cfg.tessBase + 'tesseract.min.js');
    const b = VS.cfg.tessBase;
    const w = await g.Tesseract.createWorker('eng', 1, { workerPath: b + 'worker.min.js', corePath: b + 'core', langPath: b + 'lang/' + model, gzip: true, workerBlobURL: false });
    await w.setParameters({ tessedit_char_whitelist: WL, tessedit_pageseg_mode: '7', user_defined_dpi: '300' }); PSM[model] = '7';
    return w;
  })().catch(e => { delete TW[model]; throw e; }));
};
VS.release = async function (model) { if (TW[model]) { const p = TW[model]; delete TW[model]; try { (await p).terminate(); } catch (e) {} } };
VS.preload = () => { VS.ocr().catch(() => {}); VS.zxing().catch(() => {}); };
VS.zxing = function () { return zxP || (zxP = (g.ZXing ? Promise.resolve() : loadScript(VS.cfg.zxing)).then(() => g.ZXing)); };
let nativeDet;
VS.detector = async function () {
  if (nativeDet !== undefined) return nativeDet; nativeDet = null;
  if ('BarcodeDetector' in g) try { const f = await BarcodeDetector.getSupportedFormats(); const want = ['code_39', 'code_128', 'qr_code', 'data_matrix'].filter(x => f.includes(x));
    if (want.includes('code_39')) nativeDet = new BarcodeDetector({ formats: want }); } catch (e) {}
  return nativeDet;
};
let zxReader = null;
VS.barcode = async function (src) {  // src: canvas / ImageBitmap / video -> VIN or null
  const det = await VS.detector();
  if (det) { try { for (const b of await det.detect(src)) { const v = VS.fromBarcode(b.rawValue); if (v) return v; } } catch (e) {} return null; }
  const Z = await VS.zxing(); let cv = src;
  if (!(src instanceof HTMLCanvasElement)) { const w = src.naturalWidth || src.videoWidth || src.width, h = src.naturalHeight || src.videoHeight || src.height, k = Math.min(1, 1600 / Math.max(w, h)); cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k; cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); }
  if (!zxReader) { zxReader = new Z.MultiFormatReader(); const hn = new Map(); hn.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX]); hn.set(Z.DecodeHintType.TRY_HARDER, true); zxReader.setHints(hn); }
  try { const r = zxReader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))); return VS.fromBarcode(r.getText()); } catch (e) { return null; } finally { if (cv !== src) VS.free(cv); }
};
// iPhone Safari limits TOTAL canvas memory (~224-384 MB) and frees canvases only at garbage collection; past the limit
// getContext() returns null and every read fails. So every scratch canvas is shrunk to 0x0 as soon as it has been used.
VS.free = c => { try { if (c && c.width !== undefined) { c.width = 0; c.height = 0; } } catch (e) {} };
const ctx2d = (c, o) => { const x = c.getContext('2d', o); if (!x) throw Object.assign(new Error('The phone ran out of image memory — close other tabs/apps and try again'), { code: 'canvas' }); return x; };
// ---------------- preprocessing ----------------
/** crop (sx,sy,sw,sh) of src, scale (~2x, max 2200 px wide), grayscale, contrast stretch (2-98 pct), optional invert, optional Otsu threshold */
VS.prep = function (src, sx, sy, sw, sh, o) {
  o = o || {}; const k = Math.max(0.5, Math.min(o.scale || 2, (o.maxW || 2200) / sw, (o.maxH || 2200) / sh));
  const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const x = ctx2d(c, { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data, n = d.length / 4, gy = new Uint8ClampedArray(n), hist = new Uint32Array(256);
  let sum = 0; for (let i = 0; i < n; i++) { const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; gy[i] = v; hist[v]++; sum += v; }
  let lo = 0, hi = 255, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const mean = sum / n; let inv = o.invert; if (inv === 'auto' || inv === undefined) inv = mean < 110;  // mostly dark -> light text on dark (Tesla windshield plate)
  const span = Math.max(1, hi - lo); const st = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) { let v = (gy[i] - lo) * 255 / span; v = v < 0 ? 0 : v > 255 ? 255 : v; st[i] = inv ? 255 - v : v; }
  let thr = null;
  if (o.threshold) { const h2 = new Uint32Array(256); for (let i = 0; i < n; i++) h2[st[i]]++; let sB = 0, wB = 0, best = 0, tot = 0; for (let t = 0; t < 256; t++) tot += t * h2[t];
    for (let t = 0; t < 256; t++) { wB += h2[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * h2[t]; const mB = sB / wB, mF = (tot - sB) / wF, b = wB * wF * (mB - mF) * (mB - mF); if (b > best) { best = b; thr = t; } } }
  for (let i = 0; i < n; i++) { const v = thr == null ? st[i] : (st[i] > thr ? 255 : 0); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); c._inverted = inv; c._mean = mean; return c;
};
VS.recognize = async function (canvas, psm, model) {
  model = model || VS.cfg.model; const w = await VS.ocr(model); psm = String(psm || 7);
  if (psm != PSM[model]) { await w.setParameters({ tessedit_pageseg_mode: psm }); PSM[model] = psm; }
  const r = await w.recognize(canvas); return r.data.text || '';
};
// ---------------- still photo: barcode, whole image, centre-out strips (or a tapped band) ----------------
VS.readImage = async function (img, opt) {
  opt = opt || {}; const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height; const t0 = performance.now(); const log = opt.log || (() => {});
  const done = (r, how) => r ? Object.assign(r, { how, ms: Math.round(performance.now() - t0) }) : null;
  const bc = await VS.barcode(img); if (bc) return done({ vin: bc, valid: VS.checkDigit(bc), edits: 0 }, 'barcode');
  const tries = [];
  if (opt.tap) { const bh = H * 0.16; const y = Math.max(0, Math.min(H - bh, opt.tap.y * H - bh / 2)); tries.push([0, y, W, bh, 7], [0, Math.max(0, y - bh * .5), W, Math.min(H, bh * 2), 6]); }
  else {
    tries.push([0, 0, W, H, 3], [0, 0, W, H, 11]);          // whole photo: automatic layout, then sparse text
    for (const [bf, sf] of [[0.14, 0.07], [0.26, 0.12]]) {  // horizontal strips, centre first
      const bh = H * bf, step = H * sf, ys = [];
      for (let i = 0; Math.ceil(i / 2) * step <= H / 2; i++) { const a = H / 2 - bh / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step; if (a > -bh / 2 && a < H - bh / 2) ys.push(Math.max(0, Math.min(H - bh, a))); }
      for (const y of ys) tries.push([0, y, W, bh, 6]);
    }
  }
  let fallback = null; const all = []; let n = 0;
  const second = VS.cfg.model == 'fast' ? 'best_int' : 'fast';
  for (const model of [VS.cfg.model, second]) {
  const VARS = [{}, { threshold: true }, { scale: 2.6 }, { flip: true }];
  for (const [x, y, w, h, psm] of tries) {
    const region = [];
    for (const vo of (psm == 11 || psm == 3 ? [VARS[0], VARS[1], VARS[3]] : VARS)) {
      const big = psm == 11 || psm == 3, o = { scale: vo.scale || (big ? 1 : 2), maxW: big ? 2400 : 2600, maxH: big ? 2400 : 1200, threshold: !!vo.threshold };
      let cv = VS.prep(img, x, y, w, h, o); if (vo.flip) { const c0 = cv; cv = VS.prep(img, x, y, w, h, Object.assign(o, { invert: !c0._inverted })); VS.free(c0); }
      let txt; try { txt = await VS.recognize(cv, psm, model); } finally { VS.free(cv); } log(model + ' ' + psm, vo, txt); n++;
      if (opt.onProgress) opt.onProgress(Math.round((performance.now() - t0) / 1000), n);
      if (opt.budgetMs && performance.now() - t0 > opt.budgetMs) { const c = VS.consensus(all); if (c && c.valid && c.known) return done(c, 'ocr-photo'); return fallback ? done(Object.assign(fallback, { unsure: true, timedOut: true }), 'ocr-photo') : null; }
      const r = VS.findVin(txt);
      if (r) { if (!r.repaired) { region.push(r.vin); all.push(r.vin); }
        if (VS.strict(r) && r.edits == 0) return done(r, 'ocr-photo');
        if (r.valid && r.known && !r.ambiguous && r.edits <= 2 && all.filter(v => v == r.vin).length >= 2 && new Set(all).size <= all.length - 1) return done(Object.assign(r, { stable: true }), 'ocr-photo');  // same read from 2 preprocessings
        if (!r.valid && !VS.isNA(r.vin) && !r.repaired && all.filter(v => v == r.vin).length >= 4) return done(Object.assign(r, { stable: true, unsure: true }), 'ocr-photo');  // non-NA VIN without check digit: 3 identical reads
        if (!fallback || rank(r) > rank(fallback)) fallback = r; }
      if (opt.cancelled && opt.cancelled()) return null;
      if (!big && !r && VS.clean(txt).length < 10) break;   // nothing text-like in this strip: skip its other variants   // nothing VIN-like in this strip: skip its other variants
    }
    const c = VS.consensus(region); if (c && c.valid && c.known) return done(c, 'ocr-photo');
  }
  if (opt.single) break;   // second model only when the first found nothing certain
  }
  const c = VS.consensus(all); if (c && c.valid && c.known) return done(c, 'ocr-photo');
  return fallback ? done(Object.assign(fallback, { unsure: !VS.strict(fallback) }), 'ocr-photo') : null;
};
// ---------------- live camera ----------------
/** opts: video, guide (element over the video), onStatus(text), onFound({vin,valid,how,ms}), onFrame(canvas) ; returns controller {stop, pause, resume, torch(bool), hasTorch} */
VS.live = async function (opts) {
  const video = opts.video, t0 = performance.now(); let running = true, paused = false, found = false;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } } });
  video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream; await video.play();
  const track = stream.getVideoTracks()[0]; let caps = {}; try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) {}
  try { if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
  const voter = VS.Voter(); let frame = 0;
  const hit = (r, how) => { if (found || !running || paused) return; found = true; paused = true; r.how = how; r.ms = Math.round(performance.now() - t0); opts.onFound(r); };
  function cropRect() {  // guide box (CSS px) -> video pixels, with object-fit: cover
    const vw = video.videoWidth, vh = video.videoHeight, vr = video.getBoundingClientRect(), gr = opts.guide.getBoundingClientRect();
    const s = Math.max(vr.width / vw, vr.height / vh), ox = (vr.width - vw * s) / 2, oy = (vr.height - vh * s) / 2;
    let x = (gr.left - vr.left - ox) / s, y = (gr.top - vr.top - oy) / s, w = gr.width / s, h = gr.height / s;
    const mx = w * 0.2, my = h * 0.15; x -= mx; w += 2 * mx; y -= my; h += 2 * my;   // generous margins: VIN ends often overhang the box (and the camera sees beyond the screen edges)
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    return [x, y, w, h];
  }
  const grab = document.createElement('canvas');
  async function ocrLoop() {
    try { await VS.ocr(); } catch (e) { opts.onStatus && opts.onStatus('Text reader failed to load — barcode only. ' + (e.message || '')); return; }
    opts.onStatus && opts.onStatus('Line up the VIN inside the box');
    while (running) {
      if (paused || !video.videoWidth) { await sleep(200); continue; }
      const [x, y, w, h] = cropRect(); grab.width = w; grab.height = h; grab.getContext('2d').drawImage(video, x, y, w, h, 0, 0, w, h);
      frame++; const flip = frame % 3 == 0, thr = frame % 4 == 2;  // every 3rd frame opposite polarity; every 4th a hard threshold
      const po = { scale: 2, maxW: 2000, maxH: 400, threshold: thr };
      let cv = VS.prep(grab, 0, 0, w, h, po); if (flip) { const c0 = cv; cv = VS.prep(grab, 0, 0, w, h, Object.assign({}, po, { invert: !c0._inverted })); VS.free(c0); }
      if (opts.onFrame) opts.onFrame(cv);
      const psm = frame % 2 ? 7 : 6; let txt = ''; try { txt = await VS.recognize(cv, psm); } catch (e) {} finally { VS.free(cv); }   // alternate single-line / block (stickers, paperwork)
      if (!running || paused) continue;
      const r = voter.add(VS.findVin(txt), psm + (flip ? 'i' : '') + (thr ? 't' : '')); if (opts.onRead) opts.onRead(txt, r);
      if (r) hit(r, 'ocr-live');
      await sleep(VS.cfg.ocrGapMs);
    }
  }
  async function barcodeLoop() {
    while (running) {
      if (paused || !video.videoWidth) { await sleep(200); continue; }
      let v = null; try { v = await VS.barcode(video); } catch (e) {}
      if (v && running && !paused) hit({ vin: v, valid: VS.checkDigit(v), edits: 0 }, 'barcode');
      await sleep(VS.cfg.barcodeGapMs);
    }
  }
  ocrLoop(); barcodeLoop();
  return { hasTorch: !!caps.torch, torch: on => track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(() => {}),
    pause() { paused = true; }, resume() { voter.reset(); found = false; paused = false; },
    stop() { running = false; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; } };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
g.VinScan = VS;

// ---------------- Cloud reader (Cloudflare Worker /vin-ocr -> Workers AI vision model) ----------------
// Neuron budget (Workers AI free plan = 10,000/day): ONE call for the whole photo (~30 neurons; + the guide-box / tapped band
// when there is one). Only if that finds no check-digit-valid VIN: at most 3 extra calls on zoomed crops (~30 each). Never more.
// Errors are explicit: code 'daily_limit' (over the free limit), 'network', 'timeout', 'http'.
VS.CLOUD_EXTRA_MAX = 3;
function toJpeg(src, sx, sy, sw, sh, maxEdge, q) {
  const k = Math.min(1, maxEdge / Math.max(sw, sh)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const x = ctx2d(c); x.imageSmoothingQuality = 'high'; x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => { VS.free(c); b && b.size > 500 ? res(b) : rej(Object.assign(new Error('Could not convert the photo'), { code: 'image' })); }, 'image/jpeg', q));
}
function srcSize(src) { return [src.naturalWidth || src.videoWidth || src.width, src.naturalHeight || src.videoHeight || src.height]; }
// remember "over the daily limit" for 20 min so the phone doesn't wait on the cloud for every photo (resets 00:00 UTC anyway)
const LIM_KEY = 'luxVinOcrLimit';
VS.cloudLimited = () => { try { const t = +localStorage.getItem(LIM_KEY) || 0; const d = new Date(); return t && Date.now() - t < 20 * 60e3 && new Date(t).getUTCDate() === d.getUTCDate(); } catch (e) { return false; } };
const setLimited = on => { try { on ? localStorage.setItem(LIM_KEY, String(Date.now())) : localStorage.removeItem(LIM_KEY); } catch (e) {} };
async function post(blob, model, signal, stage) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), VS.cfg.cloudTimeoutMs);
  if (signal) signal.addEventListener('abort', () => ac.abort());
  try {
    let r;
    try { r = await fetch(VS.cfg.cloud + '?model=' + model + '&stage=' + stage, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob, signal: ac.signal }); }
    catch (e) { throw Object.assign(new Error(e.name == 'AbortError' ? 'timeout' : 'network'), { code: e.name == 'AbortError' ? 'timeout' : 'network' }); }
    if (!r.ok) throw Object.assign(new Error('Cloud reader HTTP ' + r.status), { code: 'http' });
    const j = await r.json();
    if (j && j.error === 'daily_limit') setLimited(true); else if (j && !j.error) setLimited(false);
    return j;
  } finally { clearTimeout(t); }
}
VS.cloudRead = async function (src, opts) {
  opts = opts || {}; const t0 = performance.now(), say = opts.onStage || (() => {}), q = VS.cfg.cloudQuality, M = VS.cfg.cloudMaxEdge;
  const [W, H] = srcSize(src), votes = new Map(); let calls = 0, errors = [], model = null;
  if (!W || !H) throw Object.assign(new Error('Could not open the photo'), { code: 'image' });
  const add = (res, from, weight) => { if (!res) return; if (res.error) errors.push(res.error);
    for (const c of res.candidates || []) { const e = votes.get(c.vin) || { vin: c.vin, checked: c.checked, corrected: c.corrected, alternatives: c.alternatives, score: 0, from: [] };
      if (c.checked && !e.checked) Object.assign(e, { checked: true, corrected: c.corrected }); if (c.alternatives && c.alternatives.length && !(e.alternatives || []).length) e.alternatives = c.alternatives;
      e.score += weight * (c.checked ? (c.corrected ? 2 : 3) : 1); e.from.push(from); if (!model) model = c.model; votes.set(c.vin, e); } };
  const best = () => [...votes.values()].sort((a, b) => (b.checked - a.checked) || (b.score - a.score))[0] || null;
  const finish = (b, stage) => b ? { vin: b.vin, valid: !!b.checked, unsure: !b.checked, corrected: b.corrected || null, alternatives: b.alternatives || [],
      others: [...votes.keys()].filter(v => v !== b.vin).slice(0, 3), how: 'cloud', model, stage, calls, ms: Math.round(performance.now() - t0) } : null;
  const safe = p => p.then(r => r, e => { errors.push(e.code || 'network'); return null; });
  const fail = () => { const code = errors.includes('daily_limit') ? 'daily_limit' : errors[0] || 'network';
    throw Object.assign(new Error(code == 'daily_limit' ? 'Cloud reader daily limit reached' : 'Cloud reader unavailable (' + code + ')'), { code }); };
  const focus = opts.focus || null;
  say('Reading VIN…');
  const fullBlob = await toJpeg(src, 0, 0, W, H, M, q);
  const first = [safe(post(fullBlob, 'llama32', opts.signal, 'full')).then(r => (calls++, add(r, 'full', 1), r))];
  if (focus && focus[2] > 8 && focus[3] > 8) first.push(toJpeg(src, focus[0], focus[1], focus[2], focus[3], M, q).then(b => safe(post(b, 'llama32', opts.signal, 'focus'))).then(r => (calls++, add(r, 'focus', 1.2), r)));
  await Promise.all(first);
  let b = best();
  if (b && b.checked) return finish(b, 1);
  if (opts.signal && opts.signal.aborted) return null;
  if (errors.length >= calls) fail();                 // over the limit / offline: no zoom pass, the caller falls back to the phone
  if (errors.includes('daily_limit')) return finish(b, 1);
  // zoom pass: at most 3 crops (60% of the photo) across the middle band, where plates/stickers usually are
  say('Zooming in…');
  const tw = Math.round(W * 0.6), th = Math.round(H * 0.6), cy = (H - th) >> 1;
  const tiles = [[(W - tw) >> 1, cy], [0, cy], [W - tw, cy]].slice(0, VS.CLOUD_EXTRA_MAX);
  await Promise.all(tiles.map(([x, y]) => toJpeg(src, x, y, tw, th, M, q).then(bl => safe(post(bl, 'llama32', opts.signal, 'zoom'))).then(r => (calls++, add(r, 'tile', 1)))));
  b = best();
  if (!b && errors.length >= calls) fail();
  return finish(b, 2);
};
})(window);
