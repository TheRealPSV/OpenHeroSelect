#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");
const cspawn = require("cross-spawn");
const enquirer = require("enquirer");
const glob = require("glob");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const TXT_TO_JSON = require("./xml to json converter");

// REGEXES
const NEWLINE_REGEX = /\n+/m;
const MENULOCATION_REGEX = /^((\s*"?|\s*<.*)menulocation[\s=":]{2,4}).+?(\s;\s*|".*|"?,)$/im;
const STATS_REGEX = {
  TOJ: /^[^\S\n]*"?stats"?:?\s*{[\s\S]*}(?![\s\S]*})/im,
  XML: /^.*<stats [\s\S]*<\/stats>$/im
};

// CONSTANT VALUES
const DEFAULT_HEROLIMIT = 27;
const STARTERS = 4;
const CHARINFO_LIMIT = 31;

// PATHS
const INI_PATH = "config.ini";
const MUA_RESOURCES = "mua";
const XML2_RESOURCES = "xml2";
const EXTENSIONS = ["json", "txt", "xml"];

const MUA_NAME = "Marvel Ultimate Alliance";
const XML2_NAME = "X-Men Legends 2";

const herostatOutputPath = path.resolve("temp", "herostat.xmlb");

// CONSTANT HEROSTAT PIECES
const CHAR_END = {
  JSON: `
  }
}
`,
  XML: `
</characters>
`
};
const CHAR_START = {
  JSON: `{
  "characters": {
`,
  XML: `<characters>
`
};
const DEFAULTMAN = {
  JSON: `"stats": {
  "autospend": "support_heavy",
  "body": 1,
  "characteranims": "00_testguy",
  "charactername": "defaultman",
  "level": 1,
  "menulocation": 0,
  "mind": 1,
  "name": "default",
  "skin": "0002",
  "strength": 1,
  "team": "enemy",
  "talent": {
      "level": 1,
      "name": "fightstyle_default"
  }
}`
};
Object.assign(DEFAULTMAN, {
  XML: JSON_TO_XML(DEFAULTMAN.JSON)
});
const DEFAULTMAN_XML2 = {
  JSON: `"stats": {
  "autospend": "support_heavy",
  "body": "1",
  "characteranims": "00_testguy",
  "charactername": "defaultman",
  "level": "1",
  "mind": "1",
  "name": "default",
  "skin": "0002",
  "speed": "1",
  "strength": "1",
  "Race": {
      "name": "Mutant"
  },
  "Race": {
      "name": "XMen"
  },
  "talent": {
      "level": "1",
      "name": "fightstyle_hero"
  }
}`
};
Object.assign(DEFAULTMAN_XML2, {
  XML: JSON_TO_XML(DEFAULTMAN_XML2.JSON)
});
const TEAM_CHARACTER = {
  JSON: `"stats": {
  "autospend": "support",
  "isteam": true,
  "name": "team_character",
  "skin": "0002",
  "xpexempt": true
}
`
};
Object.assign(TEAM_CHARACTER, {
  XML: JSON_TO_XML(TEAM_CHARACTER.JSON)
});

// CONSTANT CHARINFO PIECES
const CHARINFO_START = `{
  "charinfo": {`;
const HERO_START = `
      "hero": {`;
const HERO_END = `
      }`;
const START_GAME = `,
          "start_game": "normal"`;
const UNLOCKED = `,
          "unlocked": "normal"`;

// OPTIONS
const PLATFORM_OPTIONS = new Map([["PC - MO2 Method", "MO2"], ["PC - Direct Method", "Direct"], ["Consoles", "Console"]]);
const XML2_ROSTER_SIZES = new Map([["19 (GameCube, PS2, or Xbox)", 19], ["23 (PSP)", 23]]);

// Shared Options Object
let options = {};

const main = async (automatic = false, xml2 = false) => {
  const resourcePath = xml2 ? XML2_RESOURCES : MUA_RESOURCES;
  //clear temp folder
  fs.removeSync("temp");
  fs.mkdirSync("temp", { recursive: true });

  //find config file
  const configPath = path.resolve(resourcePath, INI_PATH);

  if (xml2) {
    options = {
      rosterSize: null,
	  unlockSkins: null
    };
  } else {
    options = {
      menulocationsValue: null,
      rosterHack: null,
	  charinfoName: null
    };
  }
  Object.assign(options, {
	platform: null,
    rosterValue: null,
    gameInstallPath: null,
	packageMod: null,
    exeName: null,
    herostatName: null,
	newGamePyName: null,
    unlocker: null,
    launchGame: null,
    saveTempFiles: null,
    showProgress: null,
    debugMode: null,
    herostatFolder: "xml"
  });

  let saveOptions = false;
  let skipOptionsPrompts = false;

  let readOptions = null;
  //check for existing config and load it if available
  if (fs.existsSync(configPath)) {
    try {
      readOptions = JSON.parse(fs.readFileSync(configPath, "utf8"));
      //verify each options value is valid and only load valid keys
      Object.keys(options).forEach(item => {
        options[item] = (readOptions[item] !== undefined && readOptions[item] !== null)
          ? readOptions[item]
          : options[item];
      });
    } catch (e) {
      console.error("Found malformed config.ini file");
      readOptions = null;
    }
  }

  if (automatic) {
    //run in automatic mode, bypassing option prompts if available
    if (readOptions) {
      console.log("Running in automatic mode, using options below:");
      console.log(JSON.stringify(options, null, 2));
    } else {
      console.error("Missing or malformed config.ini file.");
      throw new Error("Missing or malformed config.ini file.");
    }
  } else {
    //prompt for options
    if (readOptions) {
      //ask to use existing config.ini options if found
      console.log("Found existing saved options below:");
      console.log(JSON.stringify(options, null, 2));
      skipOptionsPrompts = await new enquirer.Confirm({
        name: 'skipoptions',
        message: 'Use saved options from config.ini file?',
        initial: true
      }).run();
    }

    if (!skipOptionsPrompts) {
      //if config.ini not found, or decided to change options, prompt

      // Ask the user which platform is in use
      const platformChoices = Array.from(PLATFORM_OPTIONS.keys());
	  options.platform = PLATFORM_OPTIONS.get(await new enquirer.Select({
	    name: 'platform',
		message: 'Which platform are you using?',
		choices: platformChoices,
		initial: platformChoices[0]
	  }).run());
	  // XML2 does not use a roster hack, but MUA1 does. Only ask about roster hacks for MUA1. 
      if (!xml2) {
		// MUA1 consoles do not support roster hacks. Only ask about roster hacks with the PC. 
		if (options.platform != "Console") {
          options.rosterHack = await new enquirer.Confirm({
            name: 'rosterhack',
            message: 'Do you have a roster size hack installed?',
            initial: false
          }).run();
		} else {
		// Consoles do not use roster hacks. 
		  options.rosterHack = false
		}

        // Ask about menulocations
        const menulocationOptions = fs.readdirSync(path.resolve(resourcePath, "menulocations"))
          .filter((item) => item.toLowerCase().endsWith(".cfg"))
          .map((item) => item.slice(0, item.length - 4));
        options.menulocationsValue = await new enquirer.Select({
          name: 'menulocations',
          message: 'Select a roster layout',
          choices: [...menulocationOptions],
          initial: "27 (Official Characters Pack)"
        }).run();
        if (!options.menulocationsValue.trim()) {
          options.menulocationsValue = "27 (Official Characters Pack)";
        } else if (!menulocationOptions.includes(options.menulocationsValue)) {
          console.error("ERROR: Invalid roster layout");
          throw new Error("ERROR: Invalid roster layout");
        }
      } else {
		// XML2 options. PC is locked at 21 characters, while the consoles have different roster sizes. 
		if (options.platform == "Console") {
          const rosterSizeChoices = Array.from(XML2_ROSTER_SIZES.keys());
          options.rosterSize = XML2_ROSTER_SIZES.get(await new enquirer.Select({
            name: 'rostersize',
            message: 'Select a roster size (platform)',
            choices: rosterSizeChoices,
            initial: rosterSizeChoices[0]
          }).run());
		} else {
		  options.rosterSize = 21
		}
      }

      // Ask about rosters
      const rosterOptions = fs.readdirSync(path.resolve(resourcePath, "rosters"))
        .filter((item) => item.toLowerCase().endsWith(".cfg"))
        .map((item) => item.slice(0, item.length - 4));
      options.rosterValue = await new enquirer.Select({
        name: 'rosters',
        message: 'Select a roster',
        choices: [...rosterOptions]
      }).run();
      if (!rosterOptions.includes(options.rosterValue)) {
        console.error("ERROR: Invalid roster");
        throw new Error("ERROR: Invalid roster");
      }

      // Ask about menulocations. Each platform has a unique prompt.
      if (options.platform == "MO2") {
	    // With MO2, the herostat is stored in a separate folder. Default location is in AppData, so no default will be suggested. 
		options.gameInstallPath = path.resolve(
          (await new enquirer.Input({
            name: 'installpath',
            message: `Enter the path to an MO2 mod folder. Right-click to paste or just type`,
            initial: "C:\\"
          }).run()
          ).trim().replace(/['"]+/g, ''));
      } else if (options.platform == "Direct") {
		// For the direct method, the herostat goes in the base game folder, and the default location for both is in Program Files (x86).
		options.gameInstallPath = path.resolve(
          (await new enquirer.Input({
            name: 'installpath',
            message: `Enter the path to your installation of ${xml2 ? XML2_NAME : MUA_NAME}. Right-click to paste or just type`,
            initial: xml2 ? "C:\\Program Files (x86)\\Activision\\X-Men Legends 2" : "C:\\Program Files (x86)\\Activision\\Marvel - Ultimate Alliance"
          }).run()
          ).trim().replace(/['"]+/g, ''));
      } else {
		// For consoles, the herostat can be extracted anywhere, so no default will be suggested. 
		options.gameInstallPath = path.resolve(
          (await new enquirer.Input({
            name: 'installpath',
            message: `Enter the path to your extracted console herostat. Right-click to paste or just type`,
            initial: "C:\\"
          }).run()
          ).trim().replace(/['"]+/g, ''));
      }
	  // Check if a package mod is used. 
	  if (options.platform != "Console") {
		  // Only the PC uses package mods. 
          options.packageMod = await new enquirer.Confirm({
            name: 'packageMod',
            message: `Do you have a package mod installed (such as the ${xml2 ? "AXE, BHE, or MUE" : "MK on MUA Content"})?`,
            initial: false
          }).run();
		} else {
		// Consoles do not use package mods. 
		  options.packageMod = false
	  }
	  // Ask about the name of the exe
	  if (options.platform == "Direct") {
		// Direct method is the only option that might have a different exe (if a package mod is used)
		if (options.packageMod) {
		  // Only package mods have a unique exe
          options.exeName = (await new enquirer.Input({
            name: 'exename',
            message: `The filename of the package mod's exe.`,
            initial: xml2 ? "XMen2.exe" : "Game.exe"
          }).run()
          ).trim().replace(/['"]+/g, '');
		} else {
		  // Direct method without a package mod does not need to customize the exe
		  if (!xml2) {
			options.exeName = "Game.exe"
		  } else {
			options.exeName = "XMen2.exe"
		  }
		}
	  } else {
		  // MO2 and consoles don't need to pick the exe in any case. A placeholder name is used to avoid any issues. 
		  options.exeName = "null.exe"
	  }
	  // Ask about the name of other files (only different if a package mod is used)
	  if (options.platform != "Console") {
		// Only the PC supports package mods
		if (options.packageMod) {
	      // The herostat will only have a different name if a package mod is used
          options.herostatName = (await new enquirer.Input({
            name: 'herostatname',
            message: `The filename of the package mod's herostat.`,
            initial: "herostat.engb"
          }).run()
          ).trim().replace(/['"]+/g, '');
		  // the new_game.py file will only have a different name if a package mod is used
          options.newGamePyName = (await new enquirer.Input({
            name: 'newGamePyName',
            message: `The filename of the package mod's new_game file.`,
            initial: "new_game.py"
          }).run()
          ).trim().replace(/['"]+/g, '');
		  if (!xml2) {
		  // the charinfo.xmlb file will only have a different name if a package mod is used. Only MUA1 uses charinfo
            options.charinfoName = (await new enquirer.Input({
              name: 'charinfoName',
              message: `The filename of the package mod's charinfo file.`,
              initial: "charinfo.xmlb"
            }).run()
            ).trim().replace(/['"]+/g, '');
		  }
		} else {
	      // PC without package mods uses the standard file names. 
		  options.herostatName = "herostat.engb"
		  options.newGamePyName = "new_game.py"
		  if (!xml2) {
			// Only MUA1 uses charinfo
			options.charinfoName = "charinfo.xmlb"
		  }
	    }
	  } else {
		// Consoles always use the standard file names.
		options.herostatName = "herostat.engb"
		options.newGamePyName = "new_game.py"
		if (!xml2) {
		  // only MUA1 uses charinfo
		  options.charinfoName = "charinfo.xmlb"
		}
	  }
      options.unlocker = await new enquirer.Confirm({
        name: 'unlocker',
        message: `Update character unlocks?`,
        initial: xml2 ? true : false
      }).run();
      // XML2-specific new_game.py choices
      if (options.unlocker && xml2) {
		// ask if the user wants to unlock skins
        options.unlockSkins = await new enquirer.Confirm({
          name: 'unlockSkins',
          message: `Unlock skins?`,
          initial: false
        }).run();
      }		  
	  // Ask if the user wants to start the game (PC direct method only)
	  if (options.platform == "Direct") {
        options.launchGame = await new enquirer.Confirm({
          name: 'launchgame',
          message: 'Launch the game when done?',
          initial: false
        }).run();
	  } else {
		// MO2 and consoles can't run the game from OHS
		options.launchGame = false
	  }
      options.saveTempFiles = await new enquirer.Confirm({
        name: 'savetemp',
        message: 'Save the intermediate temp files?',
        initial: false
      }).run();
      options.showProgress = await new enquirer.Confirm({
        name: 'showprogress',
        message: 'Show progress? (Leaving this disabled provides a performance boost.)',
        initial: false
      }).run();
      options.debugMode = await new enquirer.Confirm({
        name: 'debugMode',
        message: 'Test herostats? (Shows more details on errors, but reduces performance.)',
        initial: false
      }).run();
      saveOptions = await new enquirer.Confirm({
        name: 'teamcharacterincluded',
        message: 'Save these options to config.ini file?',
        initial: true
      }).run();
    }

    //begin writing progress
    writeProgress(0);

    //write options to config if desired
    if (saveOptions) {
      fs.writeFileSync(configPath, JSON.stringify(options, null, 2));
    }
  }

  //load chosen roster and menulocations
  const rosterFile = path.resolve(resourcePath, "rosters", `${options.rosterValue}.cfg`);
  const rosterData = fs.readFileSync(path.resolve(rosterFile), "utf8");
  const rosterRaw = rosterData
    .split(NEWLINE_REGEX)
    .filter((item) => item.trim().length)
    .map((item) => item.trim());
  const rosterList = rosterRaw
    .map((item) => item.replaceAll("*", "").replaceAll("?", ""));

  let menulocations = [];
  if (!xml2) {
    const menulocationsFile = path.resolve(resourcePath, "menulocations", `${options.menulocationsValue}.cfg`);
    const menulocationsData = fs.readFileSync(menulocationsFile, "utf8");
    menulocations = menulocationsData
      .split(NEWLINE_REGEX)
      .filter((item) => item.trim().length)
      .map((item) => parseInt(item.trim()));
  } else {
    //workaround for herostat loop since xml2 doesn't use menulocations
    menulocations = new Array(options.rosterSize);
  }

  let operations = rosterList.length + menulocations.length + 6;
  let progressPoints = 0;

  //get the path from the secret option
  const herostatPath = (path.isAbsolute(options.herostatFolder))
    ? options.herostatFolder
    : path.resolve(resourcePath, options.herostatFolder);

  //load stat data for each character in roster
  let starterindex = STARTERS;
  const startchars = [];
  const unlockchars = [];
  const lockchars = [];
  const characters = [];
  let FORMAT = "";
  let First = "";
  let PrevItem = "";
  rosterList.forEach((item, index) => {
    let statsData = "";
    let statsXML = "";
    let CharName = "";
    let NoHsError = "ERROR: No herostat found.";

    //define the base path, without extension and find all extensions, sorted by priority
    const ChrPth = item.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
    const fileNE = path.resolve(herostatPath, `${ChrPth}.`);
    const allext = glob.sync(fileNE + "*([^.])").map(p => {
      return path.extname(p).slice(1).toLowerCase();
    });
    let ext = EXTENSIONS.concat(allext);
    ext = ext.filter((e, i) => i === ext.indexOf(e));

    //for all extensions sorted by priority, try to parse by priority
    for (const e of ext) {
      const filePath = fileNE + e;
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, "utf8");
        try {
          statsData = fileData.match(STATS_REGEX.TOJ).join();
          if (statsData.split("\n").at(0).trim() === "stats {") {
            statsData = TXT_TO_JSON(statsData).replace(/,$/, '');
          }
          const herostatJSON = StatsJsonParse(statsData);
          FORMAT = "JSON";
          if (First && First !== "JSON") throw new Error(`XML format detected from ${First} to ${PrevItem} -- JSON expected.`);
          CharName = herostatJSON.stats.name;
          break;
        } catch (ej) {
          try {
            // If another format detected in the roster, we can't use XML, because we don't convert.
            // The first item is checked in all existing files, so JSON can take priority. For the rest, priority is based on first match:
            //   if XML, throwing error on JSON match before XML
            //   if JSON, ignores XML (and throws an error if no JSON match)
            // The break and First commands are dirty, maybe it should be updated.
            if (FORMAT === "JSON") throw new Error("XML data not converted.");
            statsData = fileData.match(STATS_REGEX.XML).join();
            const xmlAttr = new XMLParser({ ignoreAttributes: false });
            const xmlData = xmlAttr.parse(statsData);
            FORMAT = "XML";
            CharName = xmlData.stats["@_name"];
            if (First) {
              break;
            } else {
              statsXML = statsData;
            }
          } catch (ex) {
            // XML parse error not processed.
            // Just continue with the next file extension. Clear statsData.
            statsData = "";
            NoHsError = ej;
          }
        }
      }
    }

    //if first char only had true XML among found files, need to throw error on JSON match
    if (!First) {
      First = (FORMAT === "XML") ? item : FORMAT;
      if (FORMAT === "XML") statsData = statsXML;
    }
    PrevItem = item;

    //now throw the saved error if truly no good file exists
    if (!statsData) { throw new Error(`${item}:\n${NoHsError}`); }

    //check if menulocation exists
    if (!xml2 && (statsData.match(/menulocation/gi) || []).length !== 1) {
      throw new Error(`ERROR: more or less than 1 occurrence of 'menulocation' found in ${item}`);
    }

    //prepare the characters to unlock
    if (options.unlocker) {
      if (!CharName) {
        throw new Error(`ERROR: no name found in ${item}`);
      }
      const c = rosterRaw[index];
      if (starterindex && c.indexOf("*") + 1) {
        startchars.push(CharName);
        starterindex--;
      } else if (c.indexOf("?") + 1 || c.indexOf("*") + 1) {
        unlockchars.push(CharName);
      } else {
        lockchars.push(CharName);
      }
    }

    //push to list of loaded character stats
    characters.push(statsData);
    writeProgress(((++progressPoints) / operations) * 100);
  });

  if (characters.length < menulocations.length) {
    operations = operations - menulocations.length + characters.length;
  }

  //begin generating herostat
  let herostat = CHAR_START[FORMAT];
  const comma = {
    JSON: ",",
    XML: ""
  };
  if (xml2) {
    //xml2 always has defaultman
    herostat += DEFAULTMAN_XML2[FORMAT] + comma[FORMAT] + "\n";
  } else if (options.rosterHack || characters.length < DEFAULT_HEROLIMIT || menulocations.length < DEFAULT_HEROLIMIT) {
    //for mua, add defaultman, unless no roster hack is installed and all 27 character slots are filled
    herostat += DEFAULTMAN[FORMAT] + comma[FORMAT] + "\n";
  }
  writeProgress(((++progressPoints) / operations) * 100);

  //adapt and add each character's stats to herostat
  for (let index = 0; index < menulocations.length && index < characters.length; ++index) {
    let heroValue = characters[index];
    if (!xml2) {
      //find and replace menulocation in stat with actual menulocation
      heroValue = heroValue.replace(
        MENULOCATION_REGEX,
        `$1${menulocations[index]}$3`
      );
    }
    //debug mode
    if (options.debugMode) {
      const dbgStat = CHAR_START[FORMAT] + heroValue + "\n" + CHAR_END[FORMAT];
      compileRavenFormats(dbgStat, rosterList[index], FORMAT.toLowerCase());
    };
    //append to herostat with comma and newline
    herostat += heroValue;
    //skip the last comma for xml2 since there's no TEAM_CHARACTER
    if (!xml2 || (index + 1 < menulocations.length && index + 1 < characters.length)) {
      herostat += comma[FORMAT];
    };
    herostat += "\n";
    writeProgress(((++progressPoints) / operations) * 100);
  }

  //add team_character for mua
  if (!xml2) {
    herostat += TEAM_CHARACTER[FORMAT];
  }

  //finish writing herostat
  herostat += CHAR_END[FORMAT];
  writeProgress(((++progressPoints) / operations) * 100);

  //write herostat json to disk
  compileRavenFormats(herostat, "herostat", FORMAT.toLowerCase());
  writeProgress(((++progressPoints) / operations) * 100);

  //copy converted herostat to game data directory
  fs.copyFileSync(
    herostatOutputPath,
    path.resolve(options.gameInstallPath, "data", options.herostatName)
  );
  writeProgress(((++progressPoints) / operations) * 100);

  //the remaining files will all be in JSON format
  FORMAT = "JSON";

  //start writing charinfo
  if (options.unlocker) {
    const scriptunlock = [];
    if (!xml2) {
      const allchars = startchars.concat(unlockchars, lockchars);
      const rosterSz = Math.min(menulocations.length, characters.length);
      const unlockNum = Math.max(STARTERS, Math.min(rosterSz, startchars.length + unlockchars.length));
      const charinfoNum = Math.min(CHARINFO_LIMIT, rosterSz);
      let charinfo = CHARINFO_START;
      for (const [i, CharName] of allchars.entries()) {
        let hero = HERO_START + `\n` + `            "name": "` + CharName + `"`;
        if (i < STARTERS) {
          hero += START_GAME;
        }
        if (i < unlockNum) {
          hero += UNLOCKED;
        }
        if (i < charinfoNum) {
          charinfo += hero + HERO_END;
        } else if (i < unlockNum) {
          scriptunlock.push(CharName);
        }
        if (i < charinfoNum - 1) {
          charinfo += ",";
        }
      }
      charinfo += CHAR_END.JSON;

      //write charinfo json to disk and copy to game data directory
      compileRavenFormats(charinfo, "charinfo", "json");
      fs.copyFileSync(
        path.resolve("temp", "charinfo.xmlb"),
        path.resolve(options.gameInstallPath, "data", options.charinfoName)
      );
    } else {
      Array.prototype.push.apply(scriptunlock, startchars.concat(unlockchars));
    }

    //write remaining unlock characters to script file
    const pyPath = path.resolve(options.gameInstallPath, "scripts", "menus", options.newGamePyName);
	const hardPyPath = path.resolve(options.gameInstallPath, "scripts", "menus", options.newGamePyName.slice(0,-3) + "_hard.py");
    const unlockScriptFile = path.resolve("temp", options.newGamePyName);
    const newScriptlines = [];
    const replaceString = "new_game.py";
    const regex = new RegExp(replaceString, "g");
	// the skin categories for XML2
	const skinCategoryList = ["astonishing", "aoa", "60s", "70s", "weaponx", "future", "winter", "civilian"];
	// Write to new_game.py
    if (fs.existsSync(pyPath)) {
      const scriptFile = fs.readFileSync(pyPath, "utf8");
      const scriptlines = scriptFile.split(NEWLINE_REGEX);
	  // Copy other script lines that are not unlocks
      for (const scriptline of scriptlines) {
        if (!scriptline.includes("unlockCharacter(")) {
          newScriptlines.push(scriptline.replace(regex, options.newGamePyName));
        }
      }
	  // Add the character unlocks
      for (const CharName of scriptunlock) {
        const scriptline = `unlockCharacter("` + CharName + `","")`;
        newScriptlines.push(scriptline);
      }
	  // XML2 only: add the skin unlocks if selected
	  if (options.unlockSkins && xml2) {
		for (const skinCategory of skinCategoryList) {
		  const scriptline = `unlockCharacter("","` + skinCategory + `")`;
		  newScriptlines.push(scriptline);
		}
	  }
      fs.writeFileSync(unlockScriptFile, newScriptlines.join("\n"));
      fs.copyFileSync(unlockScriptFile, pyPath);
    }
	// XML2 uses a new_game_hard.py script in addition to new_game.py. Duplicate changes are added to this file. 
	if (xml2 && fs.existsSync(hardPyPath)) {
	  const scriptFile = fs.readFileSync(hardPyPath, "utf8");
	  const scriptlines = scriptFile.split(NEWLINE_REGEX);
	  const newScriptlines = [];
	  for (const scriptline of scriptlines) {
		if (!scriptline.includes("unlockCharacter(")) {
		  newScriptlines.push(scriptline.replace(regex, options.newGamePyName));
		}
	  }
	  for (const CharName of scriptunlock) {
		const scriptline = `unlockCharacter("` + CharName + `","")`;
		newScriptlines.push(scriptline);
	  }
	  if (options.unlockSkins) {
		for (const skinCategory of skinCategoryList) {
		  const scriptline = `unlockCharacter("","` + skinCategory + `")`;
		  newScriptlines.push(scriptline);
		}
	  }
	  fs.writeFileSync(hardPyPath, newScriptlines.join("\n"));
	}
  }

  writeProgress(((++progressPoints) / operations) * 100);

  //clear temp folder if not saving temp files
  if (!options.saveTempFiles) {
    fs.removeSync("temp");
  }
  writeProgress(((++progressPoints) / operations) * 100);

  //launch game if desired
  const gamePath = path.resolve(options.gameInstallPath, options.exeName);
  if (options.launchGame && fs.existsSync(gamePath)) {
    const gameProc = cspawn(gamePath, {
      detached: true
    });
    gameProc.unref();
  }
};

function writeProgress(percent) {
  if (!options.showProgress) {
    return;
  }
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(percent === 100 ? "Done\n" : `Working, please wait... (${percent.toFixed(1)}%)`);
}

function compileRavenFormats(data, filename, ext) {
  const dPath = path.resolve("temp", `${filename}.${ext}`);
  const cPath = path.resolve("temp", `${filename}.xmlb`);
  fs.writeFileSync(dPath, data);
  //generate xmlb file
  const child = cspawn.sync(
    path.resolve("json2xmlb.exe"),
    [dPath, cPath],
    {}
  );
  if (child.stderr.length !== 0) {
    throw new Error(`${dPath}:\n${child.stderr.toString("utf8").split("\n").slice(-3).join("\n")}`);
  }
}

// JSON TO XML CONVERTER WITH FAST-XML-PARSER (ALL ATTRIBUTES VERSION)
function JSON_TO_XML(json) {
  const options = {
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    allowBooleanAttributes: true,
    suppressBooleanAttributes: false,
    format: true,
    indentBy: "    "
  };
  const XML2JSON = new XMLBuilder(options);
  // Remove StatsJsonParse for non-stats use. The replace regex converts to attributes.
  const ForceAttributes = StatsJsonParse(json.replace(/(")(.*[^{]$)/gm, `$1@_$2`));
  return XML2JSON.build(ForceAttributes).trimEnd();
}

function StatsJsonParse(str) {
  return JSON.parse(`{\n` + str.trimEnd().replace(/,$/, '') + `\n}`);
}

module.exports = main;
