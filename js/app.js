/* ====================================================================
   CLOSET FORGE DEMO: the page's own code.

   What it does, in order:
     1. Loads data/items.json (the list of clothing to add) and mod/files.json
        (the list of finished mod files), and shows the pictures.
     2. Lets the user drop their Player.sav.
     3. On "Build": gives each item the next free closet slot, writes those slots into
        a copy of Player.sav (js/lib/save.js), and zips it together with the finished
        mod files and the items' painting files (js/lib/zip.js).
     4. "Save the zip" downloads it.

   The mod files in mod/ are the same for everybody, so they are not built here.
   Only Player.sav and the Ugc/ files depend on the person's save.

   Sections:  1 Setup  2 What the page keeps track of  3 Loading the data files
              4 The Player.sav drop zone  5 Ready check  6 Build  7 Save
   ==================================================================== */
'use strict';

// ------------------------------------------------------------------
// 1. Setup and small helpers
// ------------------------------------------------------------------
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
// 2. What the page keeps track of
// ------------------------------------------------------------------
let save = null;         // { name, data } once Player.sav is loaded
let freeSlots = [];      // closet slot numbers that are still empty in that save
let clothing = null;     // the contents of data/items.json (set in section 3)
let modFiles = null;     // the paths listed in mod/files.json (set in section 3)
let itemCount = 0;       // how many closet items the pack adds (6)

// ------------------------------------------------------------------
// 3. Loading the data files and showing "What gets added"
// ------------------------------------------------------------------
async function loadClothingList() {
  try {
    clothing = await (await fetch('data/items.json')).json();
    modFiles = (await (await fetch('mod/files.json')).json()).files;
  } catch (e) {
    // Browsers block a page opened straight from a folder (file://) from reading its own files.
    $('loadError').hidden = false;
    $('loadErrorText').textContent = location.protocol === 'file:'
      ? 'Browsers do not let a page opened directly from a folder read its own data files. ' +
        'Put the site on a web server instead (GitHub Pages, or "Go Live" in the VS Code Live Server extension, ' +
        'or run  python -m http.server  in this folder and open http://localhost:8000).'
      : 'Something went wrong while loading the data files: ' + e.message;
    return;
  }
  itemCount = clothing.types.reduce((n, type) => n + type.items.length, 0);
  $('gallery').innerHTML = clothing.types.flatMap((type) => type.items.map((item) =>
    `<figure><img src="${item.image}" alt=""><figcaption>${escapeHtml(item.label)}</figcaption></figure>`
  )).join('');
  refreshBuildButton();
}

// ------------------------------------------------------------------
// 4. The Player.sav drop zone (click, keyboard or drag and drop)
// ------------------------------------------------------------------
function wireDropZone(zone, input, onFiles) {
  zone.onclick = () => input.click();
  zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { onFiles([...input.files]); input.value = ''; };
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
}

// Player.sav. We look for closet slots that are still empty.
wireDropZone($('dropSave'), $('fileSave'), async (files) => {
  if (!files[0]) return;
  save = { name: files[0].name, data: await readFileBytes(files[0]) };
  freeSlots = [];
  try {
    const items = TLSave.parseSave(save.data);      // existing clothing designs
    freeSlots = TLSave.emptySlots(save.data);       // unused closet slots
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
  if (!clothing || !modFiles) problems.push("The page's data files did not load");
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
// 6. Build: edit Player.sav, collect the Ugc files and the mod files, then zip them
// ------------------------------------------------------------------
let outputZip = null;
let outputName = 'ClosetForge_Mod.zip';
const timestamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

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
    for (const type of clothing.types) {
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

    // The edited Player.sav, with the new types in those slots.
    const edited = TLSave.writeSlots(save.data, slotTypes, slotNames);

    // The finished mod files (mod/ClosetForge_Mod/..., mod/ClosetForge_OfficialHardware/...), unchanged.
    const modZipFiles = await Promise.all(modFiles.map(async (path) => ({ path, data: await fetchBytes('mod/' + path) })));

    const zipFiles = [
      ...modZipFiles,
      { path: 'Player.sav', data: edited.data },
      ...ugcFiles,
      { path: 'README.txt', data: new TextEncoder().encode(readmeText(slotNames)) },
    ];

    outputZip = TLZip.store(zipFiles);
    outputName = 'ClosetForge_Mod_' + timestamp() + '.zip';
    log.className = 'msg good';
    log.textContent = edited.log.join('\n') + `\n\nDone. ${zipFiles.length} files, ${(outputZip.length / 1048576).toFixed(1)} MB.`;
    $('result').hidden = false;
  } catch (e) {
    log.className = 'msg err';
    log.textContent = 'Could not build: ' + e.message;
  }
};

// The README.txt that goes inside the zip. Same wording as the README on GitHub.
function readmeText(slotNames) {
  const itemList = Object.entries(slotNames).map(([slot, name]) => `  slot ${slot}: ${name}`).join('\n');
  return [
    'Closet Forge Demo - Tomodachi Life: Living the Dream v1.0.4',
    '',
    'Items added:',
    itemList,
    '',
    'ANYTHING YOU DO IN THE GAME BETWEEN DUMPING YOUR SAVE FILE AND INSTALLING THE MODIFIED ONE WILL BE LOST!',
    'Make sure to back up your original save file somewhere safe!',
    '',
    '------------------------------------------------------------',
    'How to Install (Switch Hardware)',
    '------------------------------------------------------------',
    '1. Connect your Switch\'s SD card to your PC, either physically, through USB file transfer, or an FTP server.',
    '2. Copy the ClosetForge_Mod\\romfs folder into atmosphere\\contents\\010051f0207b2000\\ on your SD card.',
    '   You don\'t need the exefs folder, as the file in there is for Ryujinx users. It won\'t crash your game if you leave it.',
    '3. Copy the contents of ClosetForge_OfficialHardware to the root of your SD card.',
    '   THIS IS IMPORTANT! It contains the exefs patch that is required to run the mod.',
    '4. Find your extracted save file. If using JKSV, this will be under JKSV\\Tomodachi Life Living the Dream\\',
    '5. Extract the .zip file of the save you wish to edit, then copy Player.sav and the Ugc\\ folder from this',
    '   .zip file into your extracted save file.',
    '6. Re-zip the save file directory on your PC. On Windows: select every file in your save directory,',
    '   right-click them, and select "Compress To -> ZIP File".',
    '7. Copy the modified save .zip file onto your SD card. If using JKSV, place it in',
    '   JKSV\\Tomodachi Life Living the Dream\\ so that JKSV can read it.',
    '8. Disconnect your Switch\'s SD card from your PC.',
    '9. Use a save manager like JKSV to restore the modified save file onto your Switch.',
    '   In JKSV: select the user with the save you wish to replace, select Tomodachi Life: Living the Dream,',
    '   and select the modified save .zip to restore to the game.',
    '10. Launch Tomodachi Life: Living the Dream.',
    '',
    '------------------------------------------------------------',
    'How to Install (Ryujinx)',
    '------------------------------------------------------------',
    '1. Open your Atmosphere mod directory: in Ryujinx, right-click Tomodachi Life: Living the Dream and press',
    '   "Open Atmosphere Mod Directory".',
    '2. Place the ClosetForge_Mod folder from this .zip file into your Atmosphere mod directory.',
    '3. Open your save file location: right-click the game and press "Open User Save Directory".',
    '4. Back up your original Player.sav file somewhere safe in case something breaks!',
    '5. Copy Player.sav and the Ugc\\ folder from this .zip file into the root of your save directory.',
    '6. Launch Tomodachi Life: Living the Dream.',
    '',
    '------------------------------------------------------------',
    'Uninstall',
    '------------------------------------------------------------',
    'To remove the new clothing types while keeping your save, remove them in-game in the Palette House first.',
    'If you do not, removing the mod folders will cause the game to crash!',
    'You may also restore your original save to revert it to before the modifications.',
    'Then remove the ClosetForge_Mod folder from your mod directory, and on Switch hardware also remove the',
    'exefs patch from atmosphere\\exefs_patches\\closet_forge\\',
    '',
    'Troubleshooting and the full instructions are in the README on the Closet Forge Demo GitHub page.',
    'This is a fan project not affiliated with Nintendo.',
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
loadClothingList();
