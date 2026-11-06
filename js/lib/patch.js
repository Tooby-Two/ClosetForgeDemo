/* TLGen exefs patch builder (port of ugc_patch.py / ugc_types.py), with a small ARM64 assembler. */
(function (root) {
'use strict';
const { murmur3: h } = root.TLCore;
const V102_BID = 'A1EFE1B6BBB0328F702F74B046EA127580C93FAB';
const V104_BID = 'B39FEF373FB12154385D012AAB3BC99EF2944470';
/* v1.0.2 code address -> v1.0.4 code address (found by matching the surrounding instructions) */
const MAP104 = {5461820:6267636,5461832:6267648,5461836:6267652,5461856:6267672,5461900:6267716,5461932:6267748,5461992:6267808,5462012:6267828,5462056:6267872,5462088:6267904,7774688:7559120,7774692:7559124,7774696:7559128,7774716:7559148,7774760:7559192,7774792:7559224,8166176:8001712,8166180:8001716,8166184:8001720,8166204:8001740,8166248:8001784,8166280:8001816,8166992:8002528,8166996:8002532,8167004:8002540,8167008:8002544,8167020:8002556,8167024:8002560,8167068:8002604,8167096:8002632,8167120:8002656,8167160:8002696,23595140:23358108,23595144:23358112,23595148:23358116,23595168:23358136,23595212:23358180,23595244:23358212,27699592:27435212,27699596:27435216,27700476:27436096,27700480:27436100,27733244:27468864,27733248:27468868,27808240:27543860,27808244:27543864,27808248:27543868,27808268:27543888,27808312:27543932,27808344:27543964,27877584:27613204,27877588:27613208,27877592:27613212,27877612:27613232,27877656:27613276,27877680:27613300,30476480:30216848,30476496:30216864,30476512:30216880,30476532:30216900,30476540:30216908,30476544:30216912,30476580:30216948,30476588:30216956,30476592:30216960,30835272:30576668,30835280:30576676,30835284:30576680,30836224:30577620,30836232:30577628,30836236:30577632,30839080:30580476,30839088:30580484,30839092:30580488,30841028:30582424,30841036:30582432,30841040:30582436,30841396:30582792,30841404:30582800,30841408:30582804,32405444:32149828,32405464:32149848,32405468:32149852,32405780:32150164,32405824:32150208,32405856:32150240,32405968:32150352,32406288:32150672,32406332:32150716,32406364:32150748,32406612:32150996,32406640:32151024,32406656:32151040,32406956:32151340,32407000:32151384,32407032:32151416,32413460:32157844,32413484:32157868,32413796:32158180,32413816:32158200,32413860:32158244,32413892:32158276,32414324:32158708,32414344:32158728,32414388:32158772,32414420:32158804,32414668:32159052,32414708:32159092,32415000:32159384,32415020:32159404,32415064:32159448,32415096:32159480};
const MAPKEYS = Object.keys(MAP104).map(Number).sort((a, b) => a - b);
function mp(a) {
  if (a >= 0x2900000) return a;
  if (MAP104[a] !== undefined) return MAP104[a];
  let best = -1; for (const k of MAPKEYS) { if (k <= a) best = k; else break; }
  if (best < 0 || a - best > 0x40) throw new Error('no 1.0.4 address for ' + a.toString(16));
  return MAP104[best] + (a - best);
}
const CAVE = 0x29e0400, CAVE_END = 0x29e1800;
const NAME_BASE = 0x29e1000, TN = 42;
const CLOTH_NAMES = ['Invalid', 'EasyH', 'TShirtN', 'TShirtH', 'TShirtL', 'TopsLongAlineN', 'TopsLongAlineH', 'TopsLongAlineL', 'Robe', 'Dress', 'SkirtS', 'SkirtL', 'PantsM', 'PantsL', 'Cap', 'Costume', 'Hat'];
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const TOPS = range(1, 10), BOTTOMS = range(10, 14), HEAD = range(14, 17);

const num = (s) => Number(s.replace('#', ''));
function asm(addr, text) {
  let m, w;
  if ((m = /^adrp x(\d+), (#\S+)$/.exec(text))) {
    const imm = (num(m[2]) >>> 12) - (addr >>> 12); const lo = imm & 3, hi = (imm >> 2) & 0x7ffff;
    w = 0x90000000 | lo << 29 | hi << 5 | +m[1];
  } else if ((m = /^add x(\d+), x(\d+), (#\S+)$/.exec(text))) {
    const i = num(m[3]); if (i > 0xfff) throw new Error('add imm'); w = 0x91000000 | i << 10 | +m[2] << 5 | +m[1];
  } else if ((m = /^add x(\d+), x(\d+), w(\d+), uxtw (#\S+)$/.exec(text))) {
    w = 0x8b200000 | +m[3] << 16 | 2 << 13 | num(m[4]) << 10 | +m[2] << 5 | +m[1];
  } else if ((m = /^cmp w(\d+), (#\S+)$/.exec(text))) {
    const i = num(m[2]); if (i > 0xfff) throw new Error('cmp imm'); w = 0x7100001f | i << 10 | +m[1] << 5;
  } else if ((m = /^ldr (w|x)(\d+), \[x(\d+), (#\S+)\]$/.exec(text))) {
    const sz = m[1] === 'w' ? 4 : 8, i = num(m[4]); if (i % sz || i / sz > 0xfff) throw new Error('ldr imm');
    w = (sz === 4 ? 0xb9400000 : 0xf9400000) | (i / sz) << 10 | +m[3] << 5 | +m[2];
  } else if ((m = /^ldrsw x(\d+), \[x(\d+), (#\S+)\]$/.exec(text))) {
    const i = num(m[3]); if (i % 4 || i / 4 > 0xfff) throw new Error('ldrsw imm'); w = 0xb9800000 | (i / 4) << 10 | +m[2] << 5 | +m[1];
  } else if ((m = /^ldr w(\d+), \[x(\d+), w(\d+), uxtw (#\S+)\]$/.exec(text))) {
    w = 0xb8600800 | +m[3] << 16 | 2 << 13 | (num(m[4]) ? 1 : 0) << 12 | +m[2] << 5 | +m[1];
  } else if ((m = /^mov w(\d+), (#\S+)$/.exec(text))) {
    const i = num(m[2]); if (i > 0xffff) throw new Error('mov imm'); w = 0x52800000 | i << 5 | +m[1];
  } else if ((m = /^movk w(\d+), (#\S+), lsl #16$/.exec(text))) {
    w = 0x72a00000 | num(m[2]) << 5 | +m[1];
  } else if (text === 'ret') w = 0xd65f03c0;
  else throw new Error('cannot assemble: ' + text);
  const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, w >>> 0, true); return b;
}
const hex = (n) => '0x' + n.toString(16);
const concat = (...a) => { let n = 0; a.forEach((x) => n += x.length); const o = new Uint8Array(n); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };
const pack32 = (arr) => { const b = new Uint8Array(arr.length * 4), dv = new DataView(b.buffer); arr.forEach((v, i) => dv.setUint32(4 * i, v >>> 0, true)); return b; };
const hexs = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

class Patch {
  constructor() { this.edits = new Map(); this.caveTop = CAVE; }
  edit(off, bytes, why) { this.edits.set(mp(off), [bytes, why || '']); }
  insn(off, text, why) { const o = mp(off); this.edits.set(o, [asm(o, text), why || text]); }
  alloc(data, why, align = 16) {
    this.caveTop = Math.ceil(this.caveTop / align) * align;
    const a = this.caveTop; this.caveTop += data.length;
    if (this.caveTop > CAVE_END) throw new Error('too many types for the code cave');
    this.edits.set(a, [data, why]); return a;
  }
  adrpAdd(off, reg, target, why) {
    this.insn(off, `adrp ${reg}, #${hex(target - (target & 0xfff))}`, why + ' (adrp)');
    this.insn(off + 4, `add ${reg}, ${reg}, #${hex(target & 0xfff)}`, why + ' (add)');
  }
  ips() {
    /* IPS32 patch for Atmosphere (offsets are NSO-file offsets: image address + 0x100) */
    const keys = [...this.edits.keys()].sort((a, b) => a - b), parts = [new TextEncoder().encode('IPS32')];
    for (const off of keys) {
      const b = this.edits.get(off)[0], hd = new Uint8Array(6), dv = new DataView(hd.buffer);
      dv.setUint32(0, off + 0x100); dv.setUint16(4, b.length); parts.push(hd, b);
    }
    parts.push(new TextEncoder().encode('EEOF'));
    return concat(...parts);
  }
  pchtxt(title, bid = V104_BID) {
    const out = [`@nsobid-${bid}`, '', `# Tomodachi Life: Living the Dream [010051F0207B2000] v1.0.4 - ${title}`, '', '@flag print_values', '@flag offset_shift 0x100', '', '@enabled'];
    for (const off of [...this.edits.keys()].sort((a, b) => a - b)) {
      const [b, why] = this.edits.get(off);
      out.push('// ' + why, off.toString(16).padStart(8, '0') + ' ' + hexs(b));
    }
    out.push('@stop');
    return out.join('\n') + '\n';
  }
}

function buildCloth(O, newTypes) {
  const p = new Patch(), K = newTypes.length, N = 17 + K;
  if (N > 31) throw new Error('at most 14 new types');
  const H = [...O.H17, ...newTypes.map((t) => h(t.name))];
  if (new Set(H).size !== N) throw new Error('hash collision between type names');
  const order = range(0, N).sort((a, b) => (H[b] - H[a]) || (b - a));
  const Hbase = p.alloc(concat(pack32(H), pack32(order)), 'cloth enum hash array H + sorted index array S');
  const sbase = 4 * N;
  const keys = [...O.keys16, ...newTypes.map((t) => h(t.key_row))];
  const cats = [...O.cats16];
  for (const t of newTypes) cats.push(t.cat_code != null ? t.cat_code : cats[CLOTH_NAMES.indexOf(t.like) - 1]);
  const Kbase = p.alloc(pack32(keys), 'cloth value -> Cloth KeyHash');
  const Cbase = p.alloc(pack32(cats), 'cloth value -> category code');
  const pred = (rng) => {
    const t = new Array(32).fill(0); rng.forEach((v) => t[v] = 1);
    newTypes.forEach((nt, i) => { if (rng.includes(CLOTH_NAMES.indexOf(nt.like)) && !nt.no_pred) t[17 + i] = 1; });
    return pack32(t);
  };
  const Ptop = p.alloc(pred(TOPS), 'is-top table'), Pbot = p.alloc(pred(BOTTOMS), 'is-bottom table'), Phead = p.alloc(pred(HEAD), 'is-headwear table');
  const mid0 = (N - 1) >> 1, first = H[order[mid0]];
  p.insn(0x7c9e50, `mov w14, #${hex(first & 0xffff)}`, 'parser first-probe hash lo');
  p.insn(0x7c9e54, `movk w14, #${hex(first >>> 16)}, lsl #16`, 'parser first-probe hash hi');
  p.adrpAdd(0x7c9e5c, 'x9', Hbase, 'parser array base');
  p.insn(0x7c9e6c, `mov w12, #${hex(N - 1)}`, 'parser hi');
  p.insn(0x7c9e70, `mov w13, #${hex(mid0)}`, 'parser first mid');
  p.insn(0x7c9ef8, `mov w13, #${hex(mid0)}`, 'parser first-hit position');
  p.insn(0x7c9e9c, `ldrsw x14, [x14, #${hex(sbase)}]`, 'parser S offset');
  p.insn(0x7c9eb8, `ldrsw x12, [x12, #${hex(sbase)}]`, 'parser S offset');
  p.insn(0x7c9ed0, `ldr w9, [x9, #${hex(sbase)}]`, 'parser S offset');
  p.insn(0x1a960d0, `mov w10, #${hex(N - 1)}`, 'hash->value hi');
  p.adrpAdd(0x1a960d4, 'x9', Hbase, 'hash->value base');
  p.insn(0x1a960ec, `ldrsw x12, [x12, #${hex(sbase)}]`, 'hash->value S offset');
  p.insn(0x1a96118, `ldrsw x10, [x10, #${hex(sbase)}]`, 'hash->value S offset');
  p.insn(0x1a96130, `ldr w0, [x8, #${hex(sbase)}]`, 'hash->value S offset');
  p.insn(0x1d68248, `cmp w8, #${hex(N - 1)}`, 'reader bound');
  p.adrpAdd(0x1d68250, 'x9', Hbase, 'reader base');
  p.insn(0x1d698c4, `cmp w8, #${hex(N - 1)}`, 'reader bound');
  p.adrpAdd(0x1d698cc, 'x9', Hbase, 'reader base');
  p.insn(0x1d10924, `cmp w8, #${hex(N - 2)}`, 'keyhash bound');
  p.adrpAdd(0x1d1092c, 'x9', Kbase, 'keyhash table');
  p.insn(0x1d108f4, `cmp w8, #${hex(N - 2)}`, 'category bound');
  p.adrpAdd(0x1d108fc, 'x9', Cbase, 'category table');
  for (const [fn0, tb, nm] of [[0x1d108c0, Ptop, 'tops'], [0x1d108d0, Pbot, 'bottoms'], [0x1d108e0, Phead, 'headwear']]) {
    const fn = mp(fn0);
    p.edits.set(fn, [concat(asm(fn, `adrp x8, #${hex(tb - (tb & 0xfff))}`), asm(fn + 4, `add x8, x8, #${hex(tb & 0xfff)}`), asm(fn + 8, 'ldr w0, [x8, w0, uxtw #2]'), asm(fn + 12, 'ret')), `is-${nm} predicate via table`]);
  }
  p.insn(0x53573c, `adrp x20, #${hex(Hbase - (Hbase & 0xfff))}`, 'enum1 via-GOT lookup: array base (adrp)');
  p.insn(0x535748, `add x20, x20, #${hex(Hbase & 0xfff)}`, 'enum1 via-GOT lookup: array base (add)');
  p.insn(0x53574c, `mov w10, #${hex(N - 1)}`, 'enum1 via-GOT lookup: hi (search 1)');
  p.insn(0x5357e8, `mov w10, #${hex(N - 1)}`, 'enum1 via-GOT lookup: hi (search 2)');
  for (const [a, r] of [[0x535760, 'ldrsw x12, [x12, #X]'], [0x53578c, 'ldrsw x10, [x10, #X]'], [0x5357ac, 'ldr w8, [x8, #X]'], [0x5357fc, 'ldrsw x12, [x12, #X]'], [0x535828, 'ldrsw x10, [x10, #X]'], [0x535848, 'ldr w0, [x8, #X]']])
    p.insn(a, r.replace('X', hex(sbase)), 'enum1 via-GOT lookup: S offset');
  const H2 = [...O.H2, ...newTypes.map((t) => h('UgcClothEnum2_' + t.name))];
  if (new Set(H2).size !== N) throw new Error('hash collision (enum2)');
  const o2 = range(0, N).sort((a, b) => H2[b] - H2[a]);
  const H2base = p.alloc(concat(pack32(H2), pack32(o2)), 'cloth enum #2 hashes + sorted idx');
  p.insn(0x7c9b20, `mov w12, #${hex(N - 1)}`, 'enum2 parser hi');
  p.adrpAdd(0x7c9b24, 'x11', H2base, 'enum2 parser base');
  for (const [a, r] of [[0x7c9b3c, 'ldrsw x14, [x14, #X]'], [0x7c9b68, 'ldrsw x12, [x12, #X]'], [0x7c9b88, 'ldr w9, [x9, #X]']]) p.insn(a, r.replace('X', hex(sbase)), 'enum2 parser S offset');
  p.insn(0x1680884, `mov w10, #${hex(N - 1)}`, 'enum2 lookup hi');
  p.adrpAdd(0x1680888, 'x9', H2base, 'enum2 lookup base');
  for (const [a, r] of [[0x16808a0, 'ldrsw x12, [x12, #X]'], [0x16808cc, 'ldrsw x10, [x10, #X]'], [0x16808ec, 'ldr w0, [x8, #X]']]) p.insn(a, r.replace('X', hex(sbase)), 'enum2 lookup S offset');
  for (const [c, a, w] of [[0x1d68600, 0x1d68608, 'A'], [0x1d69128, 0x1d69130, 'B'], [0x1d69a34, 0x1d69a3c, 'C']]) {
    p.insn(c, `cmp w8, #${hex(N - 1)}`, 'enum2 reader bound ' + w);
    p.adrpAdd(a, 'x9', H2base, 'enum2 reader base ' + w);
  }
  return p;
}

function buildTypes(p, O, names) {
  const K = names.length, N = TN + K;
  const H = [...O.TH, ...names.map(h)];
  if (new Set(H).size !== N) throw new Error('hash collision (UgcType enum)');
  const S = range(0, N).sort((a, b) => H[b] - H[a]);
  const base = p.alloc(concat(pack32(H), pack32(S), pack32(S)), 'UgcType enum hashes + sorted index array + returned values');
  const so = 4 * N;
  for (const s of O.searches) {
    const reg = s.hi[1].split(' ')[1].replace(',', '');
    p.insn(s.hi[0], `mov ${reg}, #${hex(N - 1)}`, 'type enum hi bound');
    for (const [a, t] of s.s) p.insn(a, t.replace('#0xa8]', `#${hex(so)}]`), 'type enum S offset');
    p.insn(s.fetch[0], s.fetch[1].replace('#0xa8]', `#${hex(so)}]`), 'type enum final fetch');
    const b = s.base;
    if (!b) continue;
    if (b[0] === 'adrp_add') p.adrpAdd(b[1], b[2], base, 'type enum base');
    else {
      const reg2 = b[3];
      p.insn(b[1], `adrp ${reg2}, #${hex(base - (base & 0xfff))}`, 'type enum base (adrp)');
      p.insn(b[2], `add ${reg2}, ${reg2}, #${hex(base & 0xfff)}`, 'type enum base (add)');
    }
  }
  return p;
}

function buildNames(p, names) {
  p.insn(0x1a6a988, `adrp x0, #${hex(NAME_BASE)}`, 'type name (out of range): base');
  p.insn(0x1a6a98c, 'add x0, x0, w1, uxtw #4', 'type name: + 16*index');
  p.insn(0x1a6acfc, `adrp x0, #${hex(NAME_BASE)}`, 'type name (out of range): base');
  p.insn(0x1a6ad00, 'add x0, x0, w8, uxtw #4', 'type name: + 16*index');
  p.insn(0x1a72cfc, `adrp x8, #${hex(NAME_BASE)}`, 'type name (out of range): base');
  p.insn(0x1a72d00, 'add x8, x8, w0, uxtw #4', 'type name: + 16*index');
  names.forEach((n, i) => {
    const b = root.TLCore.enc.encode(n); if (b.length > 15) throw new Error('type names must be 15 characters or fewer');
    const o = new Uint8Array(16); o.set(b); p.edit(NAME_BASE + 16 * (TN + i), o, `type name string for index ${TN + i}`);
  });
  return p;
}

root.TLPatch = { Patch, asm, buildCloth, buildTypes, buildNames, V102_BID, V104_BID, CLOTH_NAMES };
if (typeof module !== 'undefined') module.exports = root.TLPatch;
})(typeof window !== 'undefined' ? window : globalThis);
