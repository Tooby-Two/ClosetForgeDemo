/* ====================================================================
   CLOSET FORGE DEMO: the page's own code.

   What it does, in order:
     1. Loads data/items.json (the list of clothing to add) and shows the pictures.
     2. Lets the user drop their six game table files and their Player.sav.
     3. On "Build": fetches the models/textures/paintings, assigns the next free
        closet slots, runs the mod generator (js/lib/gen.js) and zips the result.
     4. "Save the zip" downloads it.

   Sections:  1 Setup  2 Required files  3 Loading the clothing list
              4 Drop zones  5 Ready check  6 Build  7 Save
   ==================================================================== */
'use strict';

// ------------------------------------------------------------------
// 1. Setup and small helpers
// ------------------------------------------------------------------
// The game tables are zstd-compressed; give the helper library a decoder (fzstd, in js/lib).
TLCore.setZstdDecoder((bytes) => fzstd.decompress(bytes));

const $ = (id) => document.getElementById(id);
const readFileBytes = (file) => file.arrayBuffer().then((buf) => new Uint8Array(buf));
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Download one of this site's own files as bytes.
async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load ${url} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

// Light/dark toggle. With no choice made yet, follow the system setting.
$('themeBtn').onclick = () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = isDark ? 'light' : 'dark';
};

// ------------------------------------------------------------------
// 2. What the user has to provide
// ------------------------------------------------------------------
// [key used in code, file name to look for, folder in the game dump (shown as a hint)]
const REQUIRED_GAME_FILES = [
  ['typeparam',  'UgcTypeParam.Product.100.rstbl.byml',    'RSDB/'],
  ['clothparam', 'UgcClothParam.Product.100.rstbl.byml',   'RSDB/'],
  ['cloth',      'Cloth.Product.100.rstbl.byml',           'RSDB/'],
  ['models',     'ClothModelParam.Product.100.rstbl.byml', 'RSDB/'],
  ['gdl',        'GameDataList.Product.100.byml',          'GameData/'],
  ['rst',        'ResourceSizeTable.Product.100.Nin_NX_NVN.rsizetable', 'System/Resource'],
];

const gameTables = {};   // key -> file bytes, filled as the user drops files
let save = null;         // { name, data } once Player.sav is loaded
let freeSlots = [];      // closet slot numbers that are still empty in that save
let clothing = null;     // the contents of data/items.json (set in section 3)
let itemCount = 0;       // how many closet items the pack adds (6)
let orig = null;         // data/orig.json: stock table rows the generator starts from

// ------------------------------------------------------------------
// 3. Loading the clothing list and showing "What gets added"
// ------------------------------------------------------------------
async function loadClothingList() {
  try {
    clothing = await (await fetch('data/items.json')).json();
    orig = await (await fetch('data/orig.json')).json();
  } catch (e) {
    // Browsers block a page opened straight from a folder (file://) from reading its own files.
    $('loadError').hidden = false;
    $('loadErrorText').textContent = location.protocol === 'file:'
      ? 'Browsers do not let a page opened directly from a folder read its own data files. ' +
        'Put the site on a web server instead (GitHub Pages, or "Go Live" in the VS Code Live Server extension, ' +
        'or run  python -m http.server  in this folder and open http://localhost:8000).'
      : 'Something went wrong while loading data/items.json: ' + e.message;
    return;
  }
  itemCount = clothing.types.reduce((n, type) => n + type.items.length, 0);
  $('gallery').innerHTML = clothing.types.flatMap((type) => type.items.map((item) =>
    `<figure><img src="${item.image}" alt=""><figcaption>${escapeHtml(item.label)}</figcaption></figure>`
  )).join('');
  refreshBuildButton();
}

// ------------------------------------------------------------------
// 4. Drop zones (click, keyboard or drag and drop)
// ------------------------------------------------------------------
function wireDropZone(zone, input, onFiles) {
  zone.onclick = () => input.click();
  zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { onFiles([...input.files]); input.value = ''; };
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
}

// Step 1: game files. We match by name, so a "3f983359-" style prefix doesn't matter.
function drawGameChecklist() {
  $('gameChecks').innerHTML = REQUIRED_GAME_FILES.map(([key, fileName, folder]) => `
    <li class="${gameTables[key] ? 'ok' : ''}">
      <span class="dot"></span>
      <div>
        <div class="fn">${fileName}.zs</div>
        <div class="where">${gameTables[key] ? 'Loaded!' : 'Not Loaded: located in the ' + folder + ' folder'}</div>
      </div>
    </li>`).join('');
  refreshBuildButton();
}
wireDropZone($('dropGame'), $('fileGame'), async (files) => {
  for (const file of files) {
    const match = REQUIRED_GAME_FILES.find(([, fileName]) => file.name.includes(fileName));
    if (match) gameTables[match[0]] = await readFileBytes(file);
  }
  drawGameChecklist();
});

// Step 2: Player.sav. We look for closet slots that are still empty.
wireDropZone($('dropSave'), $('fileSave'), async (files) => {
  if (!files[0]) return;
  save = { name: files[0].name, data: await readFileBytes(files[0]) };
  freeSlots = [];
  try {
    const items = TLGen.parseSave(save.data);      // existing clothing designs
    freeSlots = TLGen.emptySlots(save.data);       // unused closet slots
    $('saveInfo').textContent = `${save.name} loaded! ${items.length} clothing items found, ${freeSlots.length} free closet slots!`;
  } catch (e) {
    save = null;
    $('saveInfo').innerHTML = '<span class="err">' + escapeHtml(e.message) + '</span>';
  }
  refreshBuildButton();
});

// ------------------------------------------------------------------
// 5. Is everything ready? (enables the Build button and says what's missing)
// ------------------------------------------------------------------
function listProblems() {
  const problems = [];
  if (!clothing || !orig) problems.push("The page's data files did not load");
  if (REQUIRED_GAME_FILES.some(([key]) => !gameTables[key])) problems.push('Add all six game files');
  if (!save) problems.push('Add Player.sav');
  else if (clothing && freeSlots.length < itemCount) {
    problems.push(`Your save only has ${freeSlots.length} free closet slot${freeSlots.length === 1 ? '' : 's'} and this pack needs ${itemCount}. ` +
      'Delete some of your own clothing designs in the game, then save and try again.');
  }
  return problems;
}
function refreshBuildButton() {
  const problems = listProblems();
  $('build').disabled = problems.length > 0;
  $('buildHint').textContent = problems.length ? 'Not Ready!' : 'Ready!';
  $('problems').textContent = problems.length ? problems.join('; ') : ''
  $('result').hidden = true;     // any change invalidates a previous build
}

// ------------------------------------------------------------------
// 6. Build: generate the mod files and the edited Player.sav, then zip them
// ------------------------------------------------------------------
let outputZip = null;
let outputName = 'ClosetForge_Mod.zip';
const timestamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

// Turns one entry of data/items.json into what the generator wants, fetching its files.
// A model that uses a normal map must have its texture reference pointed at that map's name.
// If the model file already does (e.g. it was saved from a build), it is used untouched.
async function prepareType(type) {
  let modelBytes = await fetchBytes(type.model);
  if (type.normalMapName) {
    const raw = TLCore.load(modelBytes);                                              // unzstd
    if (!TLCore.dec.decode(raw).includes(type.normalMapName)) {
      const inner = TLGen.detectModelName(raw, type.modelName.replace(/\.bfres(\.zs)?$/, ''), type.stockName);
      modelBytes = TLCore.zstdRaw(TLGen.retexture(raw, inner, { nrm: type.normalMapName }));
    }
  }
  const extraFiles = await Promise.all(type.files.map(async (f) => ({ path: f.path, data: await fetchBytes(f.url), rst: f.rst })));
  return {
    name: type.name,
    category: type.category,                              // top / bottom / hat
    model: { name: type.modelName, data: modelBytes },
    model_internal: type.innerName,                       // the model's own name inside the file; the game loads Tex/<name>_Body_Alb and Tex/Lo/<name> from it
    extra_files: extraFiles,
    preview: 'own', uv_mask: '', no_in: false, variants: 0,
    // Which parts of the Mii's bare body the game hides under this clothing.
    // Leave out for the game's default. Example: model_flags: { BodyBaseCutline: 889516920 }
    model_flags: type.bodyCutline ? { BodyBaseCutline: Number(type.bodyCutline) } : undefined,
  };
}

$('build').onclick = async () => {
  const log = $('log');
  log.hidden = false; log.className = 'msg'; log.textContent = 'Building...';
  $('result').hidden = true;
  try {
    // Give each item the next free closet slot, in order, and fetch its painting files.
    let nextFree = 0;
    const slotTypes = {};      // slot number -> type name (written into Player.sav)
    const slotNames = {};      // slot number -> item name shown in the game
    const ugcFiles = [];       // painting + thumbnail files for the game's Ugc folder
    const typesForGenerator = [];
    for (const type of clothing.types) {
      typesForGenerator.push(await prepareType(type));
      for (const item of type.items) {
        const slot = freeSlots[nextFree++];
        const fileBase = 'Ugc/UgcCloth' + String(slot).padStart(3, '0');
        slotTypes[slot] = type.name;
        slotNames[slot] = item.label;
        ugcFiles.push(
          { path: fileBase + '.ugctex.zs',       data: await fetchBytes(item.painting) },
          { path: fileBase + '.canvas.zs',       data: await fetchBytes(item.canvas) },
          { path: fileBase + '_Thumb.ugctex.zs', data: await fetchBytes(item.thumbnail) },
        );
      }
    }

    const result = TLGen.generate({
      orig,
      tables: gameTables,
      types: typesForGenerator,
      save: { data: save.data, slots: slotTypes, names: slotNames },
    });

    // Collect everything into the zip's folder layout.
    const seen = new Set();
    const files = result.files.filter((f) => !seen.has(f.path) && seen.add(f.path));
    const zipFiles = [];
    for (const f of files) {
      if (f.path === 'Player.sav') continue;                                    // goes at the zip root, below
      if (f.path.startsWith('for_real_switch/')) zipFiles.push({ path: 'ClosetForge_OfficialHardware/' + f.path.slice('for_real_switch/'.length), data: f.data });
      else zipFiles.push({ path: 'ClosetForge_Mod/' + f.path, data: f.data });
    }
    zipFiles.push({ path: 'Player.sav', data: files.find((f) => f.path === 'Player.sav').data });
    zipFiles.push(...ugcFiles);
    zipFiles.push({ path: 'README.txt', data: TLCore.enc.encode(readmeText(slotNames)) });

    outputZip = TLCore.zipStore(zipFiles);
    outputName = 'ClosetForge_Mod_' + timestamp() + '.zip';
    log.className = 'msg good';
    log.textContent = result.log.join('\n') + `\n\nDone. ${zipFiles.length} files, ${(outputZip.length / 1048576).toFixed(1)} MB.`;
    $('result').hidden = false;
  } catch (e) {
    log.className = 'msg err';
    log.textContent = 'Could not build: ' + e.message +
      (/already exists/.test(e.message) ? '\nThese game files look like they came from a mod. Use the original, unmodded files from your game dump.' : '');
  }
};

// The README.txt that goes inside the zip.
function readmeText(slotNames) {
  const itemList = Object.entries(slotNames).map(([slot, name]) => `  slot ${slot}: ${name}`).join('\n');
  return [
    'Closet Forge demo mod',
    'Items added:',
    itemList,
    '',
    '1. Ryujinx: copy ClosetForge_Mod into mods/contents/010051F0207B2000/ (game v1.0.4).',
    '   Official hardware (Atmosphere): copy the exefs and romfs folders from ClosetForge_Mod into sd:/atmosphere/contents/010051F0207B2000/',
    '   and copy the atmosphere folder from ClosetForge_OfficialHardware onto sd:/atmosphere/. The .pchtxt file is for Ryujinx only.',
    '2. Back up your Player.sav, then copy Player.sav over yours.',
    '3. Copy the files exported in the Ugc/ folder into the Ugc/ folder in your save directory.',
    '',
    'Keep your original Player.sav as a backup. Please!',
    '',
  ].join('\n');
}

// ------------------------------------------------------------------
// 7. Save the zip
// ------------------------------------------------------------------
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([outputZip], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url; link.download = outputName;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $('saveStatus').textContent = 'Downloaded ' + outputName + '.';
};

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------
drawGameChecklist();
loadClothingList();
