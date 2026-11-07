# Closet Forge Demo

A web page that builds a mod that adds six new clothing items to Tomodachi Life: Living the Dream v1.0.4.

## AI Disclaimer

This project was assisted heavily by generative AI. I used Anthropic Claude (Sonnet 5.5) to assist with developing this mod.

The AI provided much of the coding for both the mod and the site. It also helped with reverse-engineering the game's data formats, and helped create the `exefs` patch used in the mod. I oversaw and edited the code made to the site and to the mod.

AI was not used to rip and edit the models and textures. The models and textures were edited and exported in Blender and Switch Toolbox by myself. I also tested the mod in-game myself and made changes based on multiple tests.

I wrote this README, though the AI did help me draft parts of it.

## Requirements

Tomodachi Life: Living the Dream v1.0.4

Either a hacked Switch with Atmosphere installed, or an emulator that supports mods like Ryujinx. This mod has only been tested on official Switch hardware and Ryujinx, so compatibility with other emulators is unknown.

If using a Switch, you will need an application that can export and edit save files. I personally use JKSV ( https://github.com/J-D-K/JKSV ). 

### Necessary Files

Closet Forge needs particular files in order to generate the mod. 

You will need your `Player.sav` file, extracted from your save data. On Switch, you will need to extract your save file via a save manager like JKSV. On Ryujinx, you can right-click Tomodachi Life: Living the Dream and select "Open User Save Directory".

If using JKSV, you will need to open the application on your Switch, select the user you wish to export the save file for, select Tomodachi Life: Living the Dream, and create a new save backup. The save file's .zip will be saved on your SD card under `JKSV\Tomodachi Life Living the Dream\`. You can then copy this .zip file onto your PC and extract it to replace the files.

**Anything you do between dumping the save file and installing the modified one will be lost!**

On your save file, you will need six empty UGC clothing slots. If you are close to or at the limit, you will need to delete some of your clothes in-game. The site will alert you if you do not have enough UGC slots available.

You will also have to provide the six files below yourself by extracting the `romfs` folder from your game. The easiest way to do this is through an emulator like Ryujinx. On Ryujinx, right-click Tomodachi Life: Living the Dream **with the 1.0.4 update installed** and select "Extract Data -> RomFS". Choose a directory for it to extract to, then wait for the extraction to finish.

| File and location | What it does | What the mod changes |
| ---| --- | --- |
| `RSDB\UgcTypeParam.Product.100.rstbl.byml.zs` | Lists every kind of clothing design the game lets you paint (T-shirt, pants, hat, and so on) and the settings for each kind. | Adds three new clothing types: Baggy Pants, Bee Helmet and Wild Showbiz Jacket. Each is copied from a similar existing type. |
| `RSDB\UgcClothParam.Product.100.rstbl.byml.zs` | Connects each paintable type to the clothing item and texture layout it uses. | Points each new type at its own new clothing item, with the same painting layout as the stock one. |
| `RSDB\Cloth.Product.100.rstbl.byml.zs` | The game's list of clothing items, including which model each one uses. | Adds one new clothing item for each new type. |
| `RSDB\ClothModelParam.Product.100.rstbl.byml.zs` | Says which 3D model file each clothing item loads and which parts of the Mii's body it hides. | Adds one entry for each new model file, using the model's own name. |
| `GameData\GameDataList.Product.100.byml.zs` | The list of values the game and save file can store, including which clothing types are valid. | Adds the three new types to those lists, so your save accepts them. |
| `System\Resource\ResourceSizeTable.Product.100.Nin_NX_NVN.rsizetable.zs` | Tells the game how much memory to set aside for each file it loads. | Adds entries for the new models and textures, and makes room in the edited tables above. |

**You do not need Skyline for this demo!** In a possible future build, Skyline may be required, but for this demo it is not necessary to have.

## How To Use

- Drag and drop the six required `romfs` files from your 1.0.4 game dump into the first section on the site.

- Drag and drop your `Player.sav` file from your save file directory into the second section on the site.

- Press the "Build My Mod!" button in the third section of the site.

- Wait for the site to build your mod. 

- When the site is done, press the "Save The Zip" button. The site will download a .zip file.

## How to Install (Switch Hardware)

- Extract the contents of the .zip file from the site.

- Connect your Switch's SD card to your PC, either physically, through USB file transfer, or an FTP server.

- Copy the `ClosetForge_Mod\romfs` folder from the extracted .zip file into `atmosphere\contents\010051f0207b2000\` on your Switch's SD card. You don't need the `exefs` folder, as the file in there is for Ryujinx users. It won't crash your game if you leave it, however.

- Copy the contents of `ClosetForge_OfficialHardware` to the root of your SD card. **This is important!** This contains the `exefs` patch that is required to run the mod.

- Find your extracted save file. If using JKSV, this will be under `JKSV\Tomodachi Life Living the Dream\`. **Make sure to back up your original save file somewhere safe!** 

- Extract the .zip file of the save you wish to edit,, then copy `Player.sav` and the `Ugc\` folder from the Closet Forge Demo .zip file into your extracted save file. 

- Re-zip the save file directory on your PC. You can do this on Windows by selecting every file in your save directory, right-clicking the selected files, and selecting "Compress To -> ZIP File".

- Copy the modified save .zip file onto your SD card. If using JKSV, place the .zip file in `JKSV\Tomodachi Life Living the Dream\` so that JKSV can read it.

- Disconnect your Switch's SD card from your PC. 

- Use a save manager application like JKSV to restore the modified save file onto your Switch. If using JKSV, go to the application, select the user with the save file you wish to replace, select Tomodachi Life: Living the Dream, and select the modified save file .zip to restore to the game.

- Launch Tomodachi Life: Living the Dream.

## How to Install (Ryujinx)

- Extract the contents of the .zip file from the site.

- Open your Atmosphere mod directory. You can easily find this by opening Ryujinx, right-clicking Tomodachi Life: Living the Dream, and pressing "Open Atmosphere Mod Directory". 

- Place the `ClosetForge_Mod\` folder from the extracted .zip file into your Atmosphere mod directory.

- Open your save file location. You can easily find this by opening Ryujinx, right clicking Tomodachi Life: Living the Dream, and pressing "Open User Save Directory".

- **Back up your original `Player.sav` file somewhere safe in case something breaks!**

- Copy the `Player.sav` file and the `Ugc\` folder from the extracted .zip file into the root of your save directory.

- Launch Tomodachi Life: Living the Dream.

## Uninstall

**In order to remove the new clothing types while keeping your save, you must manually remove them in-game in the Palette House.** There is currently no tool to do this for you. 

**If you do not remove the clothing types from your save in-game, removing the mod folders may cause the game to crash!**

You may also restore your original save to revert it back to before the modificatons.

- Remove the Closet Forge mod folder from your mod directory, either in `atmosphere\contents\010051f0207b2000\` or `atmosphere\contents\010051f0207b2000\ClosetForge_Mod`.

- If you are on Switch hardware, remove the `exefs` patch from `atmosphere\exefs_patches\closet_forge\`.

## Notes

### Troubleshooting

**Why am I getting the error "not the 1.0.4 version" on the site?**
- This is because one or more of the six required `romfs` files are not the files from the 1.0.4 update. The 1.0.4 update changes the files from the base game. Extract the `romfs` again with the 1.0.4 update installed.
- If the `romfs` files are not the base game's files, and were modified previously by another mod, they will not function properly on the site. Make sure you use the unmodified game files.

**The game crashes on load!**
- Check that your mod directory has the correct build the site generated. 
- Make sure there are not any other mods that have duplicate files.
- Make sure your `Player.sav` and `Ugc\` folders were updated correctly. 

**I don't see the new clothing in-game!**
- If the `Player.sav` file is not updated, the new items will not show in-game. Check to make sure that the save file was edited correctly.

### Limitations

The three new clothing types will not have in-game UI allowing the user to create new clothing items of that type in the Palette House.

The six clothing items do not have a base texture, so they will only show their painted design. Every other item in the game is unchanged.

The Bee Helmet model will not have a normal map. This is because the original UGC hats do not have normal textures built in. I am working on making normal maps work for hats!

### Future Plans

I am working on making a full Closet Forge editor where users can upload their own `.bfres` model files and create their own clothing types! This is a heavy WIP at the moment and nothing is promised. 

## Credits

### Models

Miitomo models (Baggy pants and Showbiz Jackets) and Miitopia models (Bee Helmet) were made by Nintendo.

The Bee Helmet model was ripped and posted on The Models Resource by Poké-Brother: https://models.spriters-resource.com/nintendo_switch/miitopia/asset/360973/

The Baggy Pants and Showbiz Jacket models were ripped from Miitomo by Tooby_Two.

### Libraries

fzstd (MIT License)

### Applications

Blender ( https://www.blender.org/download/ )

Switch Toolbox ( https://github.com/KillzXGaming/Switch-Toolbox )

Atmosphere ( https://github.com/Atmosphere-NX/Atmosphere )

JKSV  ( https://github.com/J-D-K/JKSV )

Ryujinx Canary

### Other

This is a fan project not affiliated with Nintendo. 
