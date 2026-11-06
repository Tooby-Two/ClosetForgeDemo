/* TLGen core: BYML, murmur3, RSTBL, zstd frames, zip. No dependencies except an optional zstd decoder (fzstd). */
(function (root) {
'use strict';
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------- typed scalars
class UInt { constructor(v) { this.v = v >>> 0; } }
class Int { constructor(v) { this.v = v | 0; } }
class Float { constructor(v) { this.v = Math.fround(v); } }
class Int64 { constructor(v) { this.v = BigInt.asIntN(64, BigInt(v)); } }
class UInt64 { constructor(v) { this.v = BigInt.asUintN(64, BigInt(v)); } }
class Double { constructor(v) { this.v = v; } }
const isNum = (x) => x instanceof UInt || x instanceof Int || x instanceof Float || x instanceof Int64 || x instanceof UInt64 || x instanceof Double;

// ---------- murmur3 32 (seed 0)
function murmur3(str) {
  const d = typeof str === 'string' ? enc.encode(str) : str;
  let h = 0; const n = d.length, nb = n >> 2;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  for (let i = 0; i < nb; i++) {
    let k = (d[4 * i] | d[4 * i + 1] << 8 | d[4 * i + 2] << 16 | d[4 * i + 3] << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0; const t = nb * 4;
  switch (n & 3) {
    case 3: k ^= d[t + 2] << 16;
    case 2: k ^= d[t + 1] << 8;
    case 1: k ^= d[t]; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k;
  }
  h ^= n; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

// ---------- BYML (v2..7, little endian)
const T = { STRING: 0xa0, BINARY: 0xa1, ARRAY: 0xc0, HASH: 0xc1, STRTAB: 0xc2, BOOL: 0xd0, INT: 0xd1, FLOAT: 0xd2, UINT: 0xd3, INT64: 0xd4, UINT64: 0xd5, DOUBLE: 0xd6, NULL: 0xff };
const alignUp = (v, s) => v + (s - v % s) % s;

function bymlParse(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(data[0], data[1]);
  if (magic !== 'YB' && magic !== 'BY') throw new Error('Not a BYML (magic ' + magic + ')');
  const le = magic === 'YB';
  const u24 = (o) => (le ? data[o] | data[o + 1] << 8 | data[o + 2] << 16 : data[o + 2] | data[o + 1] << 8 | data[o] << 16);
  const u32 = (o) => dv.getUint32(o, le);
  const rstr = (o) => { let e = o; while (data[e] !== 0) e++; return dec.decode(data.subarray(o, e)); };
  const strtab = (off) => {
    if (data[off] !== T.STRTAB) throw new Error('bad string table');
    const n = u24(off + 1), a = [];
    for (let i = 0; i < n; i++) a.push(rstr(off + u32(off + 4 + 4 * i)));
    return a;
  };
  const hk = u32(4) ? strtab(u32(4)) : [], st = u32(8) ? strtab(u32(8)) : [];
  const node = (t, o) => {
    switch (t) {
      case T.STRING: return st[u32(o)];
      case T.BINARY: { const p = u32(o), n = u32(p); return data.slice(p + 4, p + 4 + n); }
      case T.ARRAY: return arr(u32(o));
      case T.HASH: return hash(u32(o));
      case T.BOOL: return u32(o) !== 0;
      case T.INT: return new Int(dv.getInt32(o, le));
      case T.FLOAT: return new Float(dv.getFloat32(o, le));
      case T.UINT: return new UInt(u32(o));
      case T.INT64: return new Int64(dv.getBigInt64(u32(o), le));
      case T.UINT64: return new UInt64(dv.getBigUint64(u32(o), le));
      case T.DOUBLE: return new Double(dv.getFloat64(u32(o), le));
      case T.NULL: return null;
    }
    throw new Error('unknown node type 0x' + t.toString(16));
  };
  const arr = (off) => {
    const n = u24(off + 1), vo = off + alignUp(n, 4) + 4, r = [];
    for (let i = 0; i < n; i++) r.push(node(data[off + 4 + i], vo + 4 * i));
    return r;
  };
  const hash = (off) => {
    const n = u24(off + 1), r = {};
    for (let i = 0; i < n; i++) { const e = off + 4 + 8 * i; r[hk[u24(e)]] = node(data[e + 3], e + 4); }
    return r;
  };
  const root_ = u32(12);
  if (!root_) return null;
  return node(data[root_], 12);
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // ASCII keys: same order as Python's
function bymlWrite(rootData, version = 7) {
  const isArr = Array.isArray, isHash = (x) => x && typeof x === 'object' && !isArr(x) && !isNum(x) && !(x instanceof Uint8Array);
  const hkSet = new Set(), stSet = new Set();
  (function mk(d) {
    if (typeof d === 'string') stSet.add(d);
    else if (isArr(d)) d.forEach(mk);
    else if (isHash(d)) for (const k of Object.keys(d)) { hkSet.add(k); mk(d[k]); }
  })(rootData);
  const hkT = new Map([...hkSet].sort(cmpStr).map((k, i) => [k, i]));
  const stT = new Map([...stSet].sort(cmpStr).map((k, i) => [k, i]));
  let buf = new Uint8Array(1 << 16), pos = 0, dv = new DataView(buf.buffer);
  const ensure = (n) => { if (pos + n > buf.length) { const nb = new Uint8Array(Math.max(buf.length * 2, pos + n)); nb.set(buf); buf = nb; dv = new DataView(buf.buffer); } };
  const w8 = (v) => { ensure(1); buf[pos++] = v; };
  const w24 = (v) => { w8(v & 255); w8((v >> 8) & 255); w8((v >> 16) & 255); };
  const w32 = (v) => { ensure(4); dv.setUint32(pos, v >>> 0, true); pos += 4; };
  const seekAlign4 = () => { const a = alignUp(pos, 4); ensure(a - pos + 4); pos = a; };
  const ph = () => { const o = pos; w32(0xffffffff); return o; };
  const setAt = (o, v) => dv.setUint32(o, v >>> 0, true);
  const wstrtab = (tab) => {
    const base = pos; w8(T.STRTAB); w24(tab.size);
    const ws = []; for (let i = 0; i < tab.size; i++) ws.push(ph());
    const last = ph();
    for (const [s, w] of [...tab.keys()].map((s, i) => [s, ws[i]])) {
      setAt(w, pos - base);
      const b = enc.encode(s); ensure(b.length + 1); buf.set(b, pos); pos += b.length; buf[pos++] = 0;
    }
    setAt(last, pos - base);
  };
  const typeOf = (d) => {
    if (typeof d === 'string') return T.STRING;
    if (d instanceof Uint8Array) return T.BINARY;
    if (isArr(d)) return T.ARRAY;
    if (typeof d === 'boolean') return T.BOOL;
    if (d instanceof Int) return T.INT;
    if (d instanceof Float) return T.FLOAT;
    if (d instanceof UInt) return T.UINT;
    if (d instanceof Int64) return T.INT64;
    if (d instanceof UInt64) return T.UINT64;
    if (d instanceof Double) return T.DOUBLE;
    if (d === null) return T.NULL;
    if (isHash(d)) return T.HASH;
    throw new Error('Invalid value type');
  };
  const isValueType = (t) => t === T.STRING || (t >= T.BOOL && t <= T.UINT) || t === T.NULL;
  const wvalue = (d) => {
    if (typeof d === 'string') w32(stT.get(d));
    else if (typeof d === 'boolean') w32(d ? 1 : 0);
    else if (d instanceof Int) { ensure(4); dv.setInt32(pos, d.v, true); pos += 4; }
    else if (d instanceof UInt) w32(d.v);
    else if (d instanceof Float) { ensure(4); dv.setFloat32(pos, d.v, true); pos += 4; }
    else if (d === null) w32(0);
    else throw new Error('Invalid value');
  };
  // structural key; mimics Python equality (1 == True == 1.0 and UInt(5) == Int(5))
  const frz = (d) => {
    if (typeof d === 'string') return 's' + JSON.stringify(d);
    if (typeof d === 'boolean') return 'n' + (d ? 1 : 0);
    if (d === null) return 'z';
    if (isNum(d)) return 'n' + String(d.v);
    if (d instanceof Uint8Array) return 'b' + Array.from(d).join(',');
    if (isArr(d)) return '[' + d.map(frz).join('|') + ']';
    return '{' + Object.keys(d).sort(cmpStr).map((k) => JSON.stringify(k) + ':' + frz(d[k])).join('|') + '}';
  };
  const map = new Map();
  const wnon = (d) => {
    const pend = [];
    if (isArr(d)) {
      w8(T.ARRAY); w24(d.length);
      for (const it of d) w8(typeOf(it));
      seekAlign4();
      for (const it of d) { if (isValueType(typeOf(it))) wvalue(it); else pend.push([it, ph()]); }
    } else if (d instanceof Uint8Array) {
      w32(d.length); ensure(d.length); buf.set(d, pos); pos += d.length;
    } else if (d instanceof UInt64) { ensure(8); dv.setBigUint64(pos, d.v, true); pos += 8; }
    else if (d instanceof Int64) { ensure(8); dv.setBigInt64(pos, d.v, true); pos += 8; }
    else if (d instanceof Double) { ensure(8); dv.setFloat64(pos, d.v, true); pos += 8; }
    else if (isHash(d)) {
      const keys = Object.keys(d).sort(cmpStr);
      w8(T.HASH); w24(keys.length);
      for (const k of keys) {
        const v = d[k], t = typeOf(v);
        w24(hkT.get(k)); w8(t);
        if (isValueType(t)) wvalue(v); else pend.push([v, ph()]);
      }
    } else throw new Error('Invalid non-value type');
    for (const [v, o] of pend) {
      const key = typeOf(v) + ':' + frz(v);
      if (map.has(key)) setAt(o, map.get(key));
      else { setAt(o, pos); map.set(key, pos); wnon(v); }
    }
  };
  if (!isArr(rootData) && !isHash(rootData)) throw new Error('root must be array or hash');
  w8(0x59); w8(0x42); ensure(2); dv.setUint16(pos, version, true); pos += 2;
  const hko = hkT.size ? ph() : (w32(0), -1);
  const sto = stT.size ? ph() : (w32(0), -1);
  const ro = ph();
  if (hko >= 0) { setAt(hko, pos); wstrtab(hkT); seekAlign4(); }
  if (sto >= 0) { setAt(sto, pos); wstrtab(stT); seekAlign4(); }
  setAt(ro, pos);
  wnon(rootData);
  seekAlign4();
  return buf.slice(0, pos);
}

// ---------- RSTBL
class Restbl {
  constructor(raw) {
    if (dec.decode(raw.subarray(0, 6)) !== 'RESTBL') throw new Error('Not a RESTBL file');
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    this.ver = dv.getUint32(6, true); this.namelen = dv.getUint32(10, true);
    const n = dv.getUint32(14, true); this.nnames = dv.getUint32(18, true);
    this.crc = [];
    for (let i = 0; i < n; i++) this.crc.push([dv.getUint32(22 + 8 * i, true), dv.getUint32(26 + 8 * i, true)]);
    this.tail = raw.slice(22 + 8 * n);
    if (this.tail.length !== this.nnames * (this.namelen + 4)) throw new Error('Unexpected RESTBL layout');
  }
  get(path) { const k = crc32(enc.encode(path)); for (const [c, s] of this.crc) if (c === k) return s; return null; }
  set(path, size) {
    const k = crc32(enc.encode(path));
    let lo = 0, hi = this.crc.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.crc[m][0] < k) lo = m + 1; else hi = m; }
    if (lo < this.crc.length && this.crc[lo][0] === k) this.crc[lo] = [k, size];
    else this.crc.splice(lo, 0, [k, size]);
  }
  toBytes() {
    const out = new Uint8Array(22 + 8 * this.crc.length + this.tail.length), dv = new DataView(out.buffer);
    out.set(enc.encode('RESTBL'), 0);
    dv.setUint32(6, this.ver, true); dv.setUint32(10, this.namelen, true); dv.setUint32(14, this.crc.length, true); dv.setUint32(18, this.nnames, true);
    this.crc.forEach(([c, s], i) => { dv.setUint32(22 + 8 * i, c, true); dv.setUint32(26 + 8 * i, s, true); });
    out.set(this.tail, 22 + 8 * this.crc.length);
    return out;
  }
}

// ---------- crc32, zip (store), zstd
let CRC_T = null;
function crc32(d) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {      // files: [{path, data:Uint8Array}]
  const parts = [], cen = []; let off = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.path), crc = crc32(f.data), n = f.data.length;
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)]);
    parts.push(lh, name, f.data);
    cen.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += lh.length + name.length + n;
  }
  let cs = 0; for (const c of cen) cs += c.length;
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), 0, 0]);
  const all = [...parts, ...cen, end]; let tot = 0; for (const p of all) tot += p.length;
  const out = new Uint8Array(tot); let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
// zstd frame made of raw blocks (valid for any decoder; no compressor needed)
function zstdRaw(d) {
  if (globalThis.TLZstd) return globalThis.TLZstd.compress(d);
  const nb = Math.max(1, Math.ceil(d.length / 131072));
  const out = new Uint8Array(4 + 1 + 4 + nb * 3 + d.length), dv = new DataView(out.buffer);
  out.set([0x28, 0xb5, 0x2f, 0xfd, 0xa0], 0); dv.setUint32(5, d.length, true);
  let o = 9, p = 0;
  for (let i = 0; i < nb; i++) {
    const n = Math.min(131072, d.length - p), last = i === nb - 1 ? 1 : 0, hdr = last | (n << 3);
    out[o++] = hdr & 255; out[o++] = (hdr >> 8) & 255; out[o++] = (hdr >> 16) & 255;
    out.set(d.subarray(p, p + n), o); o += n; p += n;
  }
  return out;
}
async function zipRead(u8) {   // -> Map(path -> Uint8Array); supports stored and deflate entries
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), m = new Map();
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
    const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(ds, ds + csz);
    if (meth === 0) m.set(name, raw.slice());
    else if (meth === 8) { const s = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')); m.set(name, new Uint8Array(await new Response(s).arrayBuffer())); }
    else throw new Error('unsupported zip compression');
  }
  return m;
}
let ZDEC = null;
function setZstdDecoder(f) { ZDEC = f; }
function isZstd(d) { return d[0] === 0x28 && d[1] === 0xb5 && d[2] === 0x2f && d[3] === 0xfd; }
function load(d) { if (isZstd(d)) { if (!ZDEC) throw new Error('no zstd decoder'); return ZDEC(d); } return d; }

root.TLCore = { UInt, Int, Float, Int64, UInt64, Double, isNum, murmur3, bymlParse, bymlWrite, Restbl, crc32, zipStore, zipRead, zstdRaw, setZstdDecoder, load, isZstd, enc, dec };
if (typeof module !== 'undefined') module.exports = root.TLCore;
})(typeof window !== 'undefined' ? window : globalThis);
