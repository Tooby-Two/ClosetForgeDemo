# Closet Forge Demo

A static site (no build step). Add six ready-made clothing items to a Tomodachi Life: Living the Dream v1.0.4 save.

## Run it
Browsers won't let a page opened by double-clicking read its own data files, so serve the folder:
- VS Code: install **Live Server**, right-click `index.html`, **Open with Live Server**
- or in this folder: `python -m http.server` and open http://localhost:8000
- or publish the folder with GitHub Pages (works as is)

## Folders
| Path | What it is |
|---|---|
| `index.html` | the page |
| `css/style.css` | colours and layout (colours are the variables at the top) |
| `js/app.js` | what the page does; start here |
| `js/lib/` | zstd decoder/encoder, game table tools, mod generator; normally not edited |
| `data/items.json` | the types and items the demo adds (names, which files each uses) |
| `models/` | the 3D models (`.bfres.zs`). Swap a file here and reload to test a new model |
| `textures/<Type>/` | the type's normal map, blank albedo and low-detail pack (already built) |
| `paintings/` | each item's colour painting (`.ugctex`), `.canvas`, and closet thumbnail |
| `images/` | pictures shown in "What gets added" |

Item names shown in the game and on the page come from `label` in `data/items.json`.
