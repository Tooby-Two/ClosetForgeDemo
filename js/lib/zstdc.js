/* Minimal zstd compressor: greedy LZ77 + predefined FSE tables, raw literals. Output is a standard zstd frame. */
(function (root) {
'use strict';
const LL_NORM = [4,3,2,2,2,2,2,2,2,2,2,2,2,1,1,1,2,2,2,2,2,2,2,2,2,3,2,1,1,1,1,1,-1,-1,-1,-1];
const OF_NORM = [1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,-1,-1,-1,-1,-1];
const ML_NORM = [1,4,3,2,2,2,2,2,2].concat(new Array(37).fill(1),[-1,-1,-1,-1,-1,-1,-1]);
const LL_BASE = [16,18,20,22,24,28,32,40,48,64,128,256,512,1024,2048,4096,8192,16384,32768,65536];
const LL_BITS = [1,1,1,1,2,2,3,3,4,6,7,8,9,10,11,12,13,14,15,16];
const ML_BASE = [35,37,39,41,43,47,51,59,67,83,99,131,259,515,1027,2051,4099,8195,16387,32771,65539];
const ML_BITS = [1,1,1,1,2,2,3,3,4,4,5,7,8,9,10,11,12,13,14,15,16];
const hb = (v) => 31 - Math.clz32(v);

function buildCTable(norm, tableLog) {
  const ts = 1 << tableLog, mask = ts - 1, step = (ts >> 1) + (ts >> 3) + 3, n = norm.length;
  const cumul = new Array(n + 1), sym = new Array(ts); let high = ts - 1;
  cumul[0] = 0;
  for (let u = 1; u <= n; u++) { if (norm[u - 1] === -1) { cumul[u] = cumul[u - 1] + 1; sym[high--] = u - 1; } else cumul[u] = cumul[u - 1] + norm[u - 1]; }
  let pos = 0;
  for (let s = 0; s < n; s++) for (let i = 0; i < norm[s]; i++) { sym[pos] = s; pos = (pos + step) & mask; while (pos > high) pos = (pos + step) & mask; }
  const st = new Array(ts), c2 = cumul.slice();
  for (let u = 0; u < ts; u++) st[c2[sym[u]]++] = ts + u;
  const dnb = new Array(n), dfs = new Array(n); let total = 0;
  for (let s = 0; s < n; s++) {
    const c = norm[s];
    if (c === 0) { dnb[s] = ((tableLog + 1) << 16) - (1 << tableLog); dfs[s] = 0; }
    else if (c === -1 || c === 1) { dnb[s] = (tableLog << 16) - (1 << tableLog); dfs[s] = total - 1; total++; }
    else { const mb = tableLog - hb(c - 1), msp = c << mb; dnb[s] = (mb << 16) - msp; dfs[s] = total - c; total += c; }
  }
  return { st, dnb, dfs, tableLog };
}
const T_LL = buildCTable(LL_NORM, 6), T_OF = buildCTable(OF_NORM, 5), T_ML = buildCTable(ML_NORM, 6);

class Bits {
  constructor() { this.out = []; this.acc = 0; this.nb = 0; }
  add(v, n) { if (!n) return; this.acc = (this.acc | ((v & ((1 << n) - 1)) << this.nb)) >>> 0; this.nb += n; while (this.nb >= 8) { this.out.push(this.acc & 255); this.acc >>>= 8; this.nb -= 8; } }
  close() { this.add(1, 1); if (this.nb > 0) { this.out.push(this.acc & 255); this.acc = 0; this.nb = 0; } return this.out; }
}
function initState(T, s) { const nbo = (T.dnb[s] + (1 << 15)) >> 16; const v = (nbo << 16) - T.dnb[s]; return T.st[(v >> nbo) + T.dfs[s]]; }
function encSym(b, T, state, s) { const nbo = (state + T.dnb[s]) >> 16; b.add(state, nbo); return T.st[(state >> nbo) + T.dfs[s]]; }
function llCode(v) { if (v < 16) return [v, 0, 0]; for (let i = LL_BASE.length - 1; i >= 0; i--) if (v >= LL_BASE[i]) return [16 + i, LL_BITS[i], v - LL_BASE[i]]; }
function mlCode(m) { if (m < 35) return [m - 3, 0, 0]; for (let i = ML_BASE.length - 1; i >= 0; i--) if (m >= ML_BASE[i]) return [32 + i, ML_BITS[i], m - ML_BASE[i]]; }

function encodeSequences(seqs) {
  const b = new Bits(), n = seqs.length;
  const codes = seqs.map((q) => { const ov = q.off + 3, oc = hb(ov); return { ll: llCode(q.ll), ml: mlCode(q.ml), oc, oe: ov - (1 << oc) }; });
  const last = codes[n - 1];
  let sML = initState(T_ML, last.ml[0]), sOF = initState(T_OF, last.oc), sLL = initState(T_LL, last.ll[0]);
  b.add(last.ll[2], last.ll[1]); b.add(last.ml[2], last.ml[1]); b.add(last.oe, last.oc);
  for (let i = n - 2; i >= 0; i--) {
    const c = codes[i];
    sOF = encSym(b, T_OF, sOF, c.oc); sML = encSym(b, T_ML, sML, c.ml[0]); sLL = encSym(b, T_LL, sLL, c.ll[0]);
    b.add(c.ll[2], c.ll[1]); b.add(c.ml[2], c.ml[1]); b.add(c.oe, c.oc);
  }
  b.add(sML, T_ML.tableLog); b.add(sOF, T_OF.tableLog); b.add(sLL, T_LL.tableLog);
  return b.close();
}

function compress(src) {
  const N = src.length, BS = 131072, out = [];
  const w32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  out.push(0x28, 0xb5, 0x2f, 0xfd, 0xa0, ...w32(N));
  // hash chains over the whole input
  const HB = 16, head = new Int32Array(1 << HB).fill(-1), prev = new Int32Array(N).fill(-1);
  const hash = (i) => (Math.imul(src[i] | src[i + 1] << 8 | src[i + 2] << 16 | src[i + 3] << 24, 2654435761) >>> (32 - HB));
  const insert = (i) => { if (i + 4 <= N) { const h = hash(i); prev[i] = head[h]; head[h] = i; } };
  let nblocks = Math.max(1, Math.ceil(N / BS));
  for (let bi = 0; bi < nblocks; bi++) {
    const bs = bi * BS, be = Math.min(N, bs + BS), last = bi === nblocks - 1 ? 1 : 0;
    const seqs = [], lits = []; let i = bs, anchor = bs;
    while (i < be) {
      let bestLen = 0, bestOff = 0;
      if (i + 4 <= N && be - i >= 4) {
        let c = head[hash(i)], depth = 24;
        while (c >= 0 && depth-- > 0) {
          if (src[c] === src[i] && src[c + 1] === src[i + 1] && src[c + 2] === src[i + 2] && src[c + 3] === src[i + 3]) {
            let l = 4; const lim = be - i; while (l < lim && src[c + l] === src[i + l]) l++;
            if (l > bestLen) { bestLen = l; bestOff = i - c; if (l === lim) break; }
          }
          c = prev[c];
        }
      }
      if (bestLen >= 4) {
        seqs.push({ ll: i - anchor, ml: bestLen, off: bestOff });
        for (let k = anchor; k < i; k++) lits.push(src[k]);
        for (let k = 0; k < bestLen; k++) insert(i + k);
        i += bestLen; anchor = i;
      } else { insert(i); i++; }
    }
    for (let k = anchor; k < be; k++) lits.push(src[k]);
    // assemble compressed block
    const cb = [];
    const ls = lits.length;
    if (ls < 32) cb.push(ls << 3); else if (ls < 4096) { const v = (1 << 2) | (ls << 4); cb.push(v & 255, v >> 8); } else { const v = (3 << 2) | (ls << 4); cb.push(v & 255, (v >> 8) & 255, (v >> 16) & 255); }
    for (let k = 0; k < ls; k++) cb.push(lits[k]);
    const ns = seqs.length;
    if (ns < 128) cb.push(ns); else if (ns < 0x7f00) cb.push((ns >> 8) + 128, ns & 255); else cb.push(255, (ns - 0x7f00) & 255, (ns - 0x7f00) >> 8);
    if (ns > 0) { cb.push(0); const bits = encodeSequences(seqs); for (const x of bits) cb.push(x); }
    const raw = be - bs;
    if (cb.length < raw) { const h = last | (2 << 1) | (cb.length << 3); out.push(h & 255, (h >> 8) & 255, (h >> 16) & 255); for (const x of cb) out.push(x); }
    else { const h = last | (raw << 3); out.push(h & 255, (h >> 8) & 255, (h >> 16) & 255); for (let k = bs; k < be; k++) out.push(src[k]); }
  }
  return Uint8Array.from(out);
}
root.TLZstd = { compress };
if (typeof module !== 'undefined') module.exports = root.TLZstd;
})(typeof window !== 'undefined' ? window : globalThis);
