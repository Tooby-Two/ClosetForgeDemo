/* ====================================================================
   A tiny zip writer. It stores files without compressing them (the game's
   files are already zstd-compressed), which keeps it short and fast.

   TLZip.store([{ path: 'folder/file.txt', data: Uint8Array }, ...])  ->  Uint8Array of the .zip
   ==================================================================== */
(function (root) {
'use strict';
const enc = new TextEncoder();

// CRC-32, which the zip format wants for every file.
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
root.TLZip = { store: zipStore };
})(typeof window !== 'undefined' ? window : globalThis);
