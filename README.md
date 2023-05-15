# OpenHeroSelect
Extendable HeroSelect script for Marvel Ultimate Alliance and X-Men Legends II

## Usage instructions
[Instructions](help_files/)

## Developing/Building instructions
* Requires python/pip (recommended Python version is 3.10) and nodejs/npm (recommended Node.JS version is 16.16) to be installed
* Recommended to use `eslint --fix` with provided `.eslintrc.js` to reformat code
* The build script should automatically add the icon and version info to the generated exes, version info is based on what's set in `package.json`
* Don't forget to run `npm i` to bring in the required dependencies, before doing anything else; also run this command after changing the project version in `package.json`, before committing the version number change

### `npm` commands
* `npm run pipsetup`: Sets up python dependencies (assumes pip is in your path)
* `npm run clean`: Clean out build files
* `npm run fullclean`: Clean out build and cache files
* `npm run build`: Builds the entire project to the build/ directory
* `npm run distpackage`: Cleans out the build/cache files, rebuilds the project, and packages it for distribution inside the `dist/` folder.
* `npm run buildohs`: Build only OpenHeroSelect.exe
* `npm run buildjson2xmlb`: Build only json2xmlb.exe
* `npm run buildcopyfiles`: Copy supporting files to build/ directory


## MarvelMods thread
https://marvelmods.com/forum/index.php/topic,10597.0.html

## Special Thanks
* [@sgprinc](https://github.com/sgprinc)/Sagap @ MarvelMods - Various improvements in v2
* [@EthanReed517](https://github.com/EthanReed517)/BaconWizard17 @ MarvelMods - xml to json conversion Python script, testing and rosters for X-Men Legends II support, additional testing and improvements
* [@nikita488](https://github.com/nikita488)/nikita488 @ MarvelMods - json to xmlb conversion Python script
* [@ak2yny](https://github.com/ak2yny)/ak2yny @ MarvelMods - OCP v2.4 character stats and roster, xml to json conversion Python script, additional testing and improvements
* [@JordanLeich](https://github.com/JordanLeich) - Additional menulocations
