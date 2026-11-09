/* ====================================================================
   Player.sav tools for the demo.

   The game keeps 300 "closet slots" for the clothing designs people paint.
   Each slot stores the type of clothing it holds as a hash (a number made from
   the type's name). Empty slots hold a special value. This file can:

     TLSave.parseSave(bytes)        -> the clothing designs already in the save
     TLSave.emptySlots(bytes)       -> the numbers of the free slots
     TLSave.writeSlots(bytes, ...)  -> a copy of the save with new types in chosen free slots
   ==================================================================== */
(function (root) {
'use strict';
const enc = new TextEncoder();

// The hash the game uses for a type name (murmur3, seed 0).
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
const h = murmur3;

// Hashes of the clothing types the game already has. Used to recognise the slot table inside the save.
const KNOWN_DEFAULT = new Set(['Cap', 'Costume', 'Dress', 'EasyH', 'Hat', 'PantsL', 'PantsM', 'Robe', 'SkirtL', 'SkirtS', 'TShirtH', 'TShirtL', 'TShirtN', 'TopsLongAlineH', 'TopsLongAlineL', 'TopsLongAlineN'].map(h).concat([2117934662]));

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

// Names shown for the game's own types, and the value that marks a free slot.
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

/* Puts a type into each chosen free slot and fills in the extra per-slot records the game expects.
     slots: { slotNumber: typeName }      names: { slotNumber: name shown in the game }
   Returns { data: the new save, log: lines describing what was done }. */
function writeSlots(savBytes, slots, names) {
  const sav = savBytes.slice(), b = findSlots(sav), log = [];
  if (b == null) throw new Error("couldn't find the UGC slot array in Player.sav");
  const dv = new DataView(sav.buffer);
  for (const [slot, typeName] of Object.entries(slots)) {
    const was = dv.getUint32(b + 4 * Number(slot), true);
    dv.setUint32(b + 4 * Number(slot), h(typeName), true);
    log.push(`save slot ${slot} -> ${typeName}`);
    if (was === EMPTY_SLOT) log.push(...fillSlot(sav, b, Number(slot), typeName, names && names[slot]));
  }
  return { data: sav, log };
}

root.TLSave = { parseSave, emptySlots, writeSlots, findSlots, murmur3 };
})(typeof window !== 'undefined' ? window : globalThis);
