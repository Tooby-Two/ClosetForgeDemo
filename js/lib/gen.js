/* TLGen mod assembler (port of ugc_newtype.py). Works on in-memory files. */
(function (root) {
'use strict';
const C = root.TLCore, P = root.TLPatch;
const { UInt, murmur3: h, isNum } = C;
const CATEGORY = { top: ['TShirtL', 'ClothTopsUgcTshirtLong'], bottom: ['PantsL', 'ClothBottomsUgcPantsLong'], hat: ['Hat', 'ClothHeadwearHatUgcBoater'] };
const LIKE_CLOTH = { TShirtN: 'ClothTopsUgcTshirtSleeveless', TShirtH: 'ClothTopsUgcTshirtHalf', TShirtL: 'ClothTopsUgcTshirtLong', PantsL: 'ClothBottomsUgcPantsLong', PantsM: 'ClothBottomsUgcPantsWide', SkirtS: 'ClothBottomsUgcSkirtMini', SkirtL: 'ClothBottomsUgcSkirtLong', Hat: 'ClothHeadwearHatUgcBoater', Cap: 'ClothHeadwearHatUgcCap' };
const ROW_FMT = (n) => `Work/Editor/UgcClothParam/${n}.editor__UgcClothParam.gyml`;
const TP_FMT = (n) => `Work/Editor/UgcTypeParam/${n}.editor__UgcTypeParam.gyml`;
const CLOTH_FMT = (n) => `Work/Data/ClothData/${n}.data__ClothData.gyml`;
const MODEL_FMT = (n) => `Work/Data/ClothModelParam/${n}.data__ClothModelParam.gyml`;
const short = (r) => r.__RowId.split('/').pop().split('.')[0];
const val = (x) => (isNum(x) ? Number(x.v) : x);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const KNOWN_DEFAULT = new Set(['Cap', 'Costume', 'Dress', 'EasyH', 'Hat', 'PantsL', 'PantsM', 'Robe', 'SkirtL', 'SkirtS', 'TShirtH', 'TShirtL', 'TShirtN', 'TopsLongAlineH', 'TopsLongAlineL', 'TopsLongAlineN'].map(h).concat([2117934662]));

function detectModelName(raw, fallback, prefer) {
  const s = Array.from(raw, (b) => String.fromCharCode(b)).join('');
  if (prefer && s.includes(prefer)) return prefer;
  const ids = new Set(s.match(/[A-Za-z0-9_]{4,}/g) || []);
  const c = [...ids].filter((i) => i.endsWith('_In') && ids.has(i.slice(0, -3))).map((i) => i.slice(0, -3)).sort();
  return c.length ? c[0] : fallback;
}
function bytesInclude(raw, str) {
  const n = C.enc.encode(str); outer: for (let i = 0; i + n.length <= raw.length; i++) { if (raw[i] !== n[0]) continue; for (let j = 1; j < n.length; j++) if (raw[i + j] !== n[j]) continue outer; return true; } return false;
}
function findSlots(sav) {
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
  for (let off = 0; off + 1208 <= sav.length; off += 4) {
    if (dv.getUint32(off, true) !== 300) continue;
    let known = 0, empty = 0, first = dv.getUint32(off + 4, true), varied = false;
    for (let i = 0; i < 300; i++) { const v = dv.getUint32(off + 4 + 4 * i, true); if (KNOWN_DEFAULT.has(v)) known++; else if (v === 2117934662) empty++; if (v !== first) varied = true; }
    if (known > 0 && varied && known + empty >= 1) return off + 4;
  }
  return null;
}

/* in: {tables:{typeparam,clothparam,cloth,models,gdl,rst}, types:[...], save?:{data,slots:{n:typeName}}, orig: orig.json, gdlExtra} */
function generate(inp) {
  const log = [], out = [];
  const types = inp.types.map((t) => Object.assign({}, t));
  const names = types.map((t) => t.name);
  if (new Set(names).size !== names.length) throw new Error('type names must be unique');
  for (const t of types) {
    if (!t.name || new TextEncoder().encode(t.name).length > 15) throw new Error(`type name "${t.name}" must be 1-15 characters`);
    if (t.like == null) { const c = CATEGORY[t.category]; if (!c) throw new Error('unknown category ' + t.category); t.like = c[0]; t.clone_cloth = c[1]; }
    else t.clone_cloth = t.clone_cloth || LIKE_CLOTH[t.like];
    const res = t.model.name;
    t.res = res.endsWith('.bfres.zs') ? res.slice(0, -9) : res.replace(/\.bfres$/, '');
    t.cloth_row = t.res;
  }
  const clArr = types.map((t) => ({ name: t.name, key_row: t.cloth_row, like: t.like, no_pred: !!t.no_pred, cat_code: t.cat_code == null ? null : t.cat_code }));
  const p = P.buildCloth(inp.orig, clArr);
  P.buildTypes(p, inp.orig, names); P.buildNames(p, names);
  out.push({ path: 'exefs/ugc_newtypes.pchtxt', data: C.enc.encode(p.pchtxt('new UGC types: ' + names.join(', '))) });
  out.push({ path: 'for_real_switch/atmosphere/exefs_patches/closet_forge/' + P.V104_BID + '.ips', data: p.ips() });

  const R = (k) => C.bymlParse(C.load(inp.tables[k]));
  const W = (rows) => C.bymlWrite(rows, 7);
  const tp = R('typeparam'), cp = R('clothparam'), cloth = R('cloth'), models = R('models'), gdl = R('gdl');
  const rst = new C.Restbl(C.load(inp.tables.rst));
  const grow = {};
  const addGrow = (k, v) => { grow[k] = (grow[k] || 0) + v; };

  for (const t of types) {
    const n = t.name, nh = h(n);
    const src = tp.find((r) => short(r) === t.like); if (!src) throw new Error('no UgcTypeParam row ' + t.like);
    const old = h(t.like), row = Object.assign({}, src);
    for (const k of Object.keys(row)) if (row[k] instanceof UInt && row[k].v === old) row[k] = new UInt(nh);
    row.__RowId = TP_FMT(n); tp.push(row);
    const csrc = cp.find((r) => short(r) === t.like); if (!csrc) throw new Error('no UgcClothParam row ' + t.like);
    const crow = Object.assign({}, csrc);
    crow.__RowId = ROW_FMT(n); crow.UgcType = new UInt(nh);
    if (t.preview === 'own') crow.ClothID = CLOTH_FMT(t.cloth_row);
    if (t.uv_mask != null) crow.UvMask = t.uv_mask;
    cp.push(crow);
    const ccl = cloth.find((r) => r.__RowId === t.clone_cloth); if (!ccl) throw new Error('no Cloth row ' + t.clone_cloth);
    const mi = new Map(models.map((r) => [val(r.__RowId), r]));
    const msrc = mi.get(val(ccl.ModelHash));
    const mid = h(MODEL_FMT(t.res));
    if (mi.has(mid)) throw new Error('model row already exists for ' + t.res);
    const m = Object.assign({}, msrc); m.__RowId = new UInt(mid);
    const mu = Object.assign({}, msrc.ModelUnit), oldname = mu.ModelName;
    for (const k of Object.keys(mu)) if (typeof mu[k] === 'string' && mu[k].includes(oldname)) mu[k] = mu[k].split(oldname).join(t.res);
    const rawm = C.load(t.model.data);
    const inner = t.model_internal || detectModelName(rawm, t.res, oldname);
    log.push(`${n}: model name inside the bfres = ${inner}`);
    mu.ModelName = inner;
    if (mu.ModelNameIn) {
      if (!t.no_in && bytesInclude(rawm, inner + '_In')) mu.ModelNameIn = inner + '_In';
      else { log.push(t.no_in ? `  tucked-in version ignored on request -> tucked in uses the normal model` : `  note: no ${inner}_In in model -> tucked in uses the normal model`); mu.ModelNameIn = inner; }
    }
    m.ModelUnit = mu;
    const conv = (v) => (typeof v === 'boolean' || typeof v !== 'number' ? v : new UInt(v));
    for (const [k, v] of Object.entries(t.model_flags || {})) m[k] = conv(v);
    models.push(m);
    const c2 = Object.assign({}, ccl);
    c2.__RowId = t.cloth_row; c2.KeyHash = new UInt(h(t.cloth_row)); c2.ModelHash = new UInt(mid); c2.PriceKey = t.cloth_row;
    for (const [k, v] of Object.entries(t.cloth_flags || {})) c2[k] = conv(v);
    cloth.push(c2);
    for (let j = 0; j < (t.variants || 0); j++) { const c3 = Object.assign({}, c2); c3.__RowId = t.cloth_row + '_v' + j; c3.KeyHash = new UInt(h(c3.__RowId)); c3.PriceKey = c3.__RowId; cloth.push(c3); log.push(`${n}: extra colour ${j}: Cloth row ${c3.__RowId}`); addGrow('RSDB/Cloth.Product.100.rstbl.byml', 512); }
    for (const sec of ['Enum', 'EnumArray']) for (const e of gdl.Data[sec]) {
      if (e.Hash && [3471065832, 3356837374].includes(e.Hash.v) && e.Values) {
        if (!e.Values.some((v) => v.v === nh)) { e.RawValues.push(n); e.Values.push(new UInt(nh)); }
      }
    }
    // model file (+ optional edits done by the caller through t.model.patched)
    const mdata = t.model.patched || t.model.data;
    out.push({ path: `romfs/Model/${t.res}.bfres.zs`, data: mdata });
    const rawFinal = t.model.patched ? C.load(t.model.patched) : rawm;
    const srcSz = rst.get(`Model/${msrc.ModelUnit.ModelResName}.bfres`) || 0;
    rst.set(`Model/${t.res}.bfres`, Math.max(srcSz, 3 * rawFinal.length));
    for (const x of (t.extra_files || [])) { const k = out.findIndex((f) => f.path === x.path); if (k >= 0) out[k] = { path: x.path, data: x.data }; else out.push({ path: x.path, data: x.data }); if (x.rst) rst.set(x.rst[0], x.rst[1]); }
    addGrow('RSDB/Cloth.Product.100.rstbl.byml', 1024);
    addGrow('RSDB/ClothModelParam.Product.100.rstbl.byml', 1024);
    addGrow('RSDB/UgcTypeParam.Product.100.rstbl.byml', 2048);
    addGrow('RSDB/UgcClothParam.Product.100.rstbl.byml', 1024);
  }
  for (const rows of [tp, cp, cloth]) rows.sort((a, b) => cmp(a.__RowId, b.__RowId));
  models.sort((a, b) => val(a.__RowId) - val(b.__RowId));
  const z = (name, data) => out.push({ path: name, data: C.zstdRaw(data) });
  z('romfs/RSDB/UgcTypeParam.Product.100.rstbl.byml.zs', W(tp));
  z('romfs/RSDB/UgcClothParam.Product.100.rstbl.byml.zs', W(cp));
  z('romfs/RSDB/Cloth.Product.100.rstbl.byml.zs', W(cloth));
  z('romfs/RSDB/ClothModelParam.Product.100.rstbl.byml.zs', W(models));
  const gb = W(gdl);
  z('romfs/GameData/GameDataList.Product.100.byml.zs', gb);
  const gk = 'GameData/GameDataList.Product.100.byml';
  rst.set(gk, Math.max(rst.get(gk) || 0, gb.length) + (inp.gdlExtra == null ? 0x20000 : inp.gdlExtra));
  log.push(`GameDataList size ${gb.length} RSTBL entry ${rst.get(gk)}`);
  for (const [k, extra] of Object.entries(grow)) { const o = rst.get(k); if (o == null) throw new Error('RSTBL has no entry ' + k); rst.set(k, o + extra); }
  z('romfs/System/Resource/ResourceSizeTable.Product.100.Nin_NX_NVN.rsizetable.zs', rst.toBytes());
  if (inp.save) {
    const sav = inp.save.data.slice(), b = findSlots(sav);
    if (b == null) throw new Error("couldn't find the UGC slot array in Player.sav");
    const dv = new DataView(sav.buffer);
    for (const [slot, tn] of Object.entries(inp.save.slots)) {
      const was = dv.getUint32(b + 4 * Number(slot), true);
      dv.setUint32(b + 4 * Number(slot), h(tn), true); log.push(`save slot ${slot} -> ${tn}`);
      if (was === EMPTY_SLOT) log.push(...fillSlot(sav, b, Number(slot), tn, inp.save.names && inp.save.names[slot]));
    }
    out.push({ path: 'Player.sav', data: sav });
  }
  return { files: out, log };
}

/* Repoint the model's texture names: Alb/Msk -> whiteName, Nrm -> nrmName (existing game texture). Appends new strings. */
function retexture(raw, inner, map) {
  const dv0 = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const find = (str) => {
    const b = C.enc.encode(str); const hits = [];
    outer: for (let i = 2; i + b.length < raw.length; i++) {
      if (raw[i] !== b[0]) continue;
      for (let j = 1; j < b.length; j++) if (raw[i + j] !== b[j]) continue outer;
      if (dv0.getUint16(i - 2, true) === b.length && raw[i + b.length] === 0) hits.push(i - 2);
    }
    return hits;
  };
  const scan = (target, step) => { const r = []; const t = BigInt(target); for (let i = 0; i + 8 <= raw.length; i += step) if (dv0.getBigUint64(i, true) === t) r.push(i); return r; };
  const ptrs = (target) => { let r = scan(target, 8); if (!r.length) r = scan(target, 4); if (!r.length) r = scan(target + 2, 8); if (!r.length) r = scan(target + 2, 4); return r; };
  const slot = { alb: '_Body_Alb', msk: '_Body_Msk', nrm: '_Body_Nrm' };
  const edits = [];
  for (const k of Object.keys(map)) {
    if (!map[k]) continue;
    const sp = find(inner + slot[k]);
    if (sp.length !== 1) throw new Error('the model has no texture named ' + inner + slot[k]);
    let pp = ptrs(sp[0]);
    if (pp.length < 1 && k === 'nrm') { // model was already run through Closet Forge: its normal slot points at an earlier TLN_ texture, so reuse that pointer
      for (let i = 2; i + 4 < raw.length; i++) if (raw[i] === 0x54 && raw[i + 1] === 0x4c && raw[i + 2] === 0x4e && raw[i + 3] === 0x5f) { const L = dv0.getUint16(i - 2, true); if (L > 8 && L < 64 && raw[i + L] === 0 && C.dec.decode(raw.subarray(i, i + L)).replace(/_+$/, '').endsWith('_Nrm')) pp = pp.concat(ptrs(i - 2)); }
    }
    if (pp.length < 1) throw new Error('could not find where this model refers to its texture ' + inner + slot[k] + ' (string at 0x' + sp[0].toString(16) + '). Try re-exporting the model from Toolbox, or send me the file.');
    edits.push([map[k], pp]);
  }
  let out = raw; const added = {};
  const append = (str) => {
    const b = C.enc.encode(str); const start = Math.ceil(out.length / 8) * 8;
    const n = Math.ceil((start + 2 + b.length + 1) / 8) * 8;
    const o = new Uint8Array(n); o.set(out); new DataView(o.buffer).setUint16(start, b.length, true); o.set(b, start + 2); out = o; return start;
  };
  for (const [t, pp] of edits) {
    if (added[t] == null) added[t] = append(t);
    const dv = new DataView(out.buffer);
    for (const p of pp) dv.setBigUint64(p, BigInt(added[t]), true);
  }
  new DataView(out.buffer).setUint32(0x1c, out.length, true);
  return out;
}
const WHITE_NAME = 'ClothTopsUgcWingsTest_Body_White', ANGEL_NRM = 'ClothAccessoryBackAngel_Body_Nrm';
const ACCESSORY = { model_flags: { BodyBaseCutline: 2895499086, IsAccessoryOnBack: true }, cloth_flags: { Type: 'Accessory', CameraKey: 'ClothAccessoryBackDefault' }, no_pred: true, cat_code: 6, preview: 'own', uv_mask: '' };
function patchPlugin(nro, slot, entries) {
  const find = (m) => { for (let i = 0; i + 12 <= nro.length; i++) { let ok = true; for (let j = 0; j < 8; j++) if (nro[i + j] !== m.charCodeAt(j)) { ok = false; break; } if (ok) return i; } return -1; };
  const i1 = find('TLFCCGV1'); if (i1 < 0) throw new Error('plugin config marker not found');
  const o = nro.slice(); const dv = new DataView(o.buffer);
  dv.setUint32(i1 + 8, slot, true);
  const i2 = find('TLFCCGV2');
  if (i2 >= 0 && entries && entries.length) {   // entries: [{key, type, idx}] up to 8
    const es = entries.slice(0, 8); dv.setUint32(i2 + 8, es.length, true);
    es.forEach((e, k) => { dv.setUint32(i2 + 12 + 12 * k, e.key >>> 0, true); dv.setUint32(i2 + 16 + 12 * k, e.type >>> 0, true); dv.setUint32(i2 + 20 + 12 * k, e.idx >>> 0, true); });
  }
  return o;
}

const TYPE_LABELS = { EasyH: 'Easy top', TShirtN: 'T-shirt, sleeveless', TShirtH: 'T-shirt, half sleeve', TShirtL: 'T-shirt, long sleeve', TopsLongAlineN: 'A-line top, sleeveless', TopsLongAlineH: 'A-line top, half sleeve', TopsLongAlineL: 'A-line top, long sleeve', Robe: 'Robe', Dress: 'Dress', SkirtS: 'Short skirt', SkirtL: 'Long skirt', PantsM: 'Wide pants', PantsL: 'Long pants', Cap: 'Cap', Costume: 'Costume', Hat: 'Hat' };
const EMPTY_SLOT = 2117934662;
/* A slot that was never created in-game has only its type hash written by us; the game also keeps per-slot records
   (created-flag-like values, id, timestamp, name) that are filled only for slots 0..7 of a used closet. Fill them. */
function fillSlot(sav, b, slot, name, display) {
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength), log = [];
  const arr0 = (d) => { const v = b + d; return v - 4 >= 0 && v + 4 * 300 <= sav.length && dv.getUint32(v - 4, true) === 300 ? v : null; };
  // The arrays after the type table sit at slightly different distances in different save versions (e.g. 212 bytes earlier in
  // the 1,325,148-byte save). Find the id array (values 0x3xxxx + slot) near its usual place and apply the same shift to its neighbours.
  let shift = 0;
  { let found = false; for (let k = -2000; k <= 2000 && !found; k += 4) { const v = b + 113628 + k; if (v - 4 < 0 || v + 1200 > sav.length || dv.getUint32(v - 4, true) !== 300) continue;
      const lo = (i) => dv.getUint32(v + 4 * i, true); if ((lo(0) >>> 16) === 3 && (lo(0) & 0xffff) === 0 && (lo(1) & 0xffff) === 1 && (lo(2) & 0xffff) === 2) { shift = k; found = true; } } }
  const arr = (d) => (d > 0 ? arr0(d + shift) : arr0(d));
  // find a reference slot that really was created in-game (has a name and id)
  let ref = -1;
  const idA = arr(113628), nmA = arr(942856);
  for (let i = 0; i < 300 && idA != null; i++) if (i !== slot && dv.getUint32(idA + 4 * i, true) !== 0) { ref = i; break; }
  if (ref < 0) { log.push('  (no created slot to copy per-slot records from, only the type was set)'); return log; }
  for (const d of [-245556, -24672, -18748, -9440]) { const a = arr(d); if (a != null) dv.setUint32(a + 4 * slot, dv.getUint32(a + 4 * ref, true), true); }
  if (idA != null) dv.setUint32(idA + 4 * slot, (dv.getUint32(idA + 4 * ref, true) & 0xffff0000) + slot, true);
  const tA = arr(293660); if (tA != null) { dv.setUint32(tA + 8 * slot, Math.floor(Date.now() / 1000), true); dv.setUint32(tA + 8 * slot + 4, 0, true); }
  if (nmA != null) { const o = nmA + 128 * slot; for (let j = 0; j < 64; j++) dv.setUint16(o + 2 * j, 0, true); const nm = (display || ('CF ' + name)).slice(0, 20); for (let j = 0; j < nm.length; j++) dv.setUint16(o + 2 * j, nm.charCodeAt(j), true); }
  log.push(`  filled per-slot records for slot ${slot} (copied from slot ${ref})`);
  return log;
}

/* Reads the closet slots of a Player.sav: [{slot, hash, label|null, created: Date|null}] for every occupied slot */
function parseSave(sav, extraNames) {
  const base = findSlots(sav); if (base == null) throw new Error("this does not look like a Tomodachi Life Player.sav (closet slots not found)");
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
  const names = new Map(Object.entries(TYPE_LABELS).map(([k, v]) => [h(k), v]));
  for (const n of extraNames || []) names.set(h(n), n + ' (new type)');
  let ts = null;
  if (sav.length === 1325148 && dv.getUint32(580704, true) === 300) ts = 580708;
  const slots = [];
  for (let i = 0; i < 300; i++) {
    const v = dv.getUint32(base + 4 * i, true); if (v === EMPTY_SLOT) continue;
    let created = null;
    if (ts != null) { const t = dv.getUint32(ts + 8 * i, true); if (t > 1e9) created = new Date(t * 1000); }
    slots.push({ slot: i, hash: v, label: names.get(v) || null, created });
  }
  return slots;
}
function emptySlots(sav) { const b = findSlots(sav); if (b == null) return []; const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength); const r = []; for (let i = 0; i < 300; i++) if (dv.getUint32(b + 4 * i, true) === EMPTY_SLOT) r.push(i); return r; }
root.TLGen = { fillSlot, emptySlots, hasTuckModel: (raw, inner) => bytesInclude(raw, inner + '_In'), parseSave, retexture, patchPlugin, WHITE_NAME, ANGEL_NRM, ACCESSORY, generate, findSlots, detectModelName };
if (typeof module !== 'undefined') module.exports = root.TLGen;
})(typeof window !== 'undefined' ? window : globalThis);
