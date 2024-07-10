#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");
const cspawn = require("cross-spawn");
const enquirer = require("enquirer");
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
const CONSOLES_HEROLIMIT = 34;
const ROSTERHACK_HEROLIMIT = 50;
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
      mannequinFolder: "mannequin",
      charinfoName: "charinfo.xmlb"
    };
  }
  Object.assign(options, {
    rosterValue: null,
    gameInstallPath: null,
    exeName: xml2 ? "XMen2.exe" : "Game.exe",
    herostatName: "herostat.engb",
    newGamePyName: "new_game.py",
    charactersHeadsPackageName: "characters_heads.pkgb",
    unlocker: null,
    launchGame: false,
    saveTempFiles: null,
    showProgress: null,
    debugMode: null,
    herostatFolder: "xml"
  });

  let platform = null;
  let packageMod = false;
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
      platform = PLATFORM_OPTIONS.get(await new enquirer.Select({
        name: 'platform',
        message: 'Which platform are you using?',
        choices: platformChoices,
        initial: platformChoices[0]
      }).run());

      if (!xml2) {
        // Consoles and XML2 do not have a roster hack.
        if (platform !== "Console") {
          options.rosterHack = await new enquirer.Confirm({
            name: 'rosterhack',
            message: 'Do you have a roster size hack installed?',
            initial: false
          }).run();
        }

        // Ask about menulocations for MUA
        const menulocationLimit = options.rosterHack
          ? ROSTERHACK_HEROLIMIT
          : platform === "Console"
            ? CONSOLES_HEROLIMIT
            : DEFAULT_HEROLIMIT;
        const menulocationOptions = fs.readdirSync(path.resolve(resourcePath, "menulocations"))
          .filter((item) => item.toLowerCase().endsWith(".cfg"))
          .filter((item) => item.slice(0, 2) <= menulocationLimit)
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
          throw new Error("Invalid roster layout");
        }
      } else {
        // XML2 PC is locked at 21 characters, while the consoles have different roster sizes.
        if (platform === "Console") {
          const rosterSizeChoices = Array.from(XML2_ROSTER_SIZES.keys());
          options.rosterSize = XML2_ROSTER_SIZES.get(await new enquirer.Select({
            name: 'rostersize',
            message: 'Select a roster size (platform)',
            choices: rosterSizeChoices,
            initial: rosterSizeChoices[0]
          }).run());
        } else {
          options.rosterSize = 21;
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
        throw new Error("Invalid roster");
      }

      // PLATFORM SPECIFIC DEFAULT LOCATIONS
      // With MO2, the herostat is stored in a separate folder. Default location is in AppData, so no default will be suggested.
      // For the direct method, the herostat goes in the base game folder, and the default location for both games is in Program Files (x86).
      // For consoles, the herostat can be extracted anywhere, so no default will be suggested.
      const GIP_DEFAULT = {
        MO2: `C:\\`,
        Direct: xml2 ? `C:\\Program Files (x86)\\Activision\\X-Men Legends 2` : `C:\\Program Files (x86)\\Activision\\Marvel - Ultimate Alliance`,
        Console: `C:\\`
      };
      const GIP_MESSAGE = {
        MO2: `an MO2 mod folder`,
        Direct: `your installation of ${xml2 ? XML2_NAME : MUA_NAME}`,
        Console: `a folder with a 'data' folder inside`
      };

      // Ask about the installation path. Each platform has a unique message.
      options.gameInstallPath = path.resolve(
        (await new enquirer.Input({
          name: 'installpath',
          message: `Enter the path to ${GIP_MESSAGE[platform]}. Right-click to paste or just type`,
          initial: GIP_DEFAULT[platform]
        }).run()
        ).trim().replace(/['"]+/g, ''));

      // Ask if a package mod is used. Only the PC supports package mods.
      if (platform !== "Console") {
        packageMod = await new enquirer.Confirm({
          name: 'packageMod',
          message: `Are you editing the herostat of a package mod (such as the ${xml2 ? "AXE, BHE, or MUE" : "MK on MUA Content"})?`,
          initial: false
        }).run();
      }

      // Ask about the file names if a package mod is used
      if (packageMod) {
        // Ask about the name of the exe for the Direct method only
        if (platform === "Direct") {
          options.exeName = (await new enquirer.Input({
            name: 'exename',
            message: `The filename of the package mod's exe.`,
            initial: xml2 ? "XMen2.exe" : "Game.exe"
          }).run()
          ).trim().replace(/['"]+/g, '');
        }
        // Ask about the name of the herostat
        options.herostatName = (await new enquirer.Input({
          name: 'herostatname',
          message: `The filename of the package mod's herostat`,
          initial: "herostat.engb"
        }).run()
        ).trim().replace(/['"]+/g, '');
        // Ask about the name of the new_game script
        options.newGamePyName = (await new enquirer.Input({
          name: 'newGamePyName',
          message: `The filename of the package mod's new_game file`,
          initial: "new_game.py"
        }).run()
        ).trim().replace(/['"]+/g, '');
        // Ask about the name of the characters_heads file
        options.charactersHeadsPackageName = (await new enquirer.Input({
          name: 'charactersHeadsPackageName',
          message: `The filename of the package mod's characters_heads file`,
          initial: "characters_heads.pkgb"
        }).run()
        ).trim().replace(/['"]+/g, '');
        // Ask about the name of the mannequin folder and charinfo for MUA1 only
        if (!xml2) {
          options.mannequinFolder = (await new enquirer.Input({
            name: 'mannequinFolder',
            message: `The mannequin folder used by the package mod`,
            initial: "mannequin"
          }).run()
          ).trim().replace(/['"]+/g, '');
          options.charinfoName = (await new enquirer.Input({
            name: 'charinfoName',
            message: `The filename of the package mod's charinfo file`,
            initial: "charinfo.xmlb"
          }).run()
          ).trim().replace(/['"]+/g, '');
        }
      } else {
        options.exeName = xml2 ? "XMen2.exe" : "Game.exe";
        options.herostatName = "herostat.engb";
        options.newGamePyName = "new_game.py";
        options.charactersHeadsPackageName = "characters_heads.pkgb";
        if (!xml2) {
          options.mannequinFolder = "mannequin";
          options.charinfoName = "charinfo.xmlb";
        }
      }

      // Ask about unlocking characters
      options.unlocker = await new enquirer.Confirm({
        name: 'unlocker',
        message: `Update character unlocks?`,
        initial: xml2
      }).run();
      // XML2-specific new_game.py choices
      if (options.unlocker && xml2) {
        // Ask if the user wants to unlock skins
        options.unlockSkins = await new enquirer.Confirm({
          name: 'unlockSkins',
          message: `Unlock skins?`,
          initial: false
        }).run();
      }
      // Ask if the user wants to start the game (PC direct method only)
      if (platform === "Direct") {
        options.launchGame = await new enquirer.Confirm({
          name: 'launchgame',
          message: `Launch the game when done?`,
          initial: false
        }).run();
      }
      options.saveTempFiles = await new enquirer.Confirm({
        name: 'savetemp',
        message: `Save the intermediate temp files?`,
        initial: false
      }).run();
      options.showProgress = await new enquirer.Confirm({
        name: 'showprogress',
        message: `Show progress? (Leaving this disabled provides a performance boost.)`,
        initial: false
      }).run();
      options.debugMode = await new enquirer.Confirm({
        name: 'debugMode',
        message: `Test herostats? (Shows more details on errors, but reduces performance.)`,
        initial: false
      }).run();
      saveOptions = await new enquirer.Confirm({
        name: 'teamcharacterincluded',
        message: `Save these options to config.ini file?`,
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

  //check if data folder exists
  const dataPath = path.resolve(options.gameInstallPath, "data");
  if (!fs.existsSync(options.gameInstallPath)) {
    throw new Error(`Folder not found\n${options.gameInstallPath}`);
  }
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data folder not found\n${dataPath}`);
  }

  //check if any characters are in the roster and complete if none
  const rosterData = fs.readFileSync(path.resolve(resourcePath, "rosters", `${options.rosterValue}.cfg`), "utf8");
  const rosterRaw = rosterData
    .split(NEWLINE_REGEX)
    .filter((item) => item.trim().length)
    .map((item) => item.trim());
  if (rosterRaw.length < 1) {
    console.log("Roster is empty.");
    return;
  }
  fs.mkdirSync("temp", { recursive: true });

  //load menulocations and prepare roster
  let menulocations = [];
  if (!xml2) {
    const menulocationsData = fs.readFileSync(path.resolve(resourcePath, "menulocations", `${options.menulocationsValue}.cfg`), "utf8");
    menulocations = menulocationsData
      .split(NEWLINE_REGEX)
      .filter((item) => item.trim().length)
      .map((item) => parseInt(item.trim()));
  } else {
    //workaround for herostat loop since xml2 doesn't use menulocations
    menulocations = new Array(options.rosterSize);
  }

  const rosterList = rosterRaw
    .slice(0, Math.min(rosterRaw.length, menulocations.length))
    .map((item) => item.replaceAll("*", "").replaceAll("?", ""));

  const operations = rosterList.length * 2 + 6;
  let progressPoints = 0;

  //get the path from the secret option
  const herostatPath = (path.isAbsolute(options.herostatFolder))
    ? options.herostatFolder
    : path.resolve(resourcePath, options.herostatFolder);

  //prepare variables for stats
  let FORMAT = "";
  let First = "";
  let PrevItem = "";
  const startchars = [];
  const unlockchars = [];
  const lockchars = [];
  const characters = [];
  const CharHeadNumbers = [];
  const herostatFiles = [];

  //read the available herostats from disk, sorted by extension priority
  const FnF = fs.readdirSync(herostatPath, { recursive: true });
  for (const e of EXTENSIONS) {
    herostatFiles.push(...FnF.filter(f => path.extname(f).toLowerCase() === `.${e}`));
  }
  herostatFiles.push(...FnF.filter(f => !EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase()) && !fs.statSync(path.resolve(herostatPath, f)).isDirectory()));

  //load stat data for each character in roster
  rosterList.forEach((item, index) => {
    let statsData = "";
    let statsXML = "";
    let CharName = "";
    let CharNumber = "";
    let NoHsError = "No herostat found.";

    //find all matching herostats, sorted by priority, and try to parse them by priority
    const itemFiles = herostatFiles
      .filter(f => f.localeCompare(path.join(item.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '')) + path.extname(f), undefined, { sensitivity: 'accent' }) === 0)
      .map(f => path.resolve(herostatPath, f));
    for (const filePath of itemFiles) {
      const fileData = fs.readFileSync(filePath, "utf8");
      try {
        statsData = fileData.match(STATS_REGEX.TOJ).join();
        if (statsData.split("\n").at(0).trim() === "stats {") {
          statsData = TXT_TO_JSON(statsData).replace(/,$/, '');
        }
        const herostatJSON = StatsJsonParse(statsData);
        FORMAT = "JSON";
        if (index > 0 && First !== "JSON") throw new Error(`XML format detected from ${First} to ${PrevItem} -- JSON expected.`);
        CharName = herostatJSON.stats.name;
        CharNumber = herostatJSON.stats.skin;
        break;
      } catch (ej) {
        try {
          // If another format detected in the roster, we can't use XML, because we don't convert.
          // The first item is checked in all existing files, so JSON can take priority. For the rest, priority is based on first match:
          // - if XML, throws error on JSON match before XML
          // - if JSON, ignores XML (and throws an error if no JSON match)
          if (FORMAT === "JSON") throw new Error("XML data not converted.");
          statsData = fileData.match(STATS_REGEX.XML).join();
          const xmlAttr = new XMLParser({ ignoreAttributes: false });
          const xmlData = xmlAttr.parse(statsData);
          FORMAT = "XML";
          CharName = xmlData.stats["@_name"];
          CharNumber = xmlData.stats["@_skin"];
          if (index > 0) {
            break;
          } else {
            statsXML = statsData;
          }
        } catch {
          // Continue (with next file) on XML parse error, but save JSON error.
          statsData = "";
          NoHsError = ej;
        }
      }
    }

    //if first char only had true XML among found files, need to throw error on JSON match
    if (index === 0) {
      First = (FORMAT === "XML") ? item : FORMAT;
      if (FORMAT === "XML") statsData = statsXML;
    }
    PrevItem = item;

    //now throw the saved error if no (good) file exists
    if (!statsData) { throw new Error(`${item}:\n${NoHsError}`); }

    //check if menulocation exists
    if (!xml2 && (statsData.match(/menulocation/gi) || []).length !== 1) {
      throw new Error(`More or less than 1 occurrence of 'menulocation' found in ${item}`);
    }

    //prepare the characters to unlock
    if (options.unlocker) {
      if (!CharName) {
        throw new Error(`No name found in ${item}`);
      }
      const c = rosterRaw[index];
      if (c.indexOf("*") > -1) {
        startchars.push(CharName);
      } else if (c.indexOf("?") > -1) {
        unlockchars.push(CharName);
      } else {
        lockchars.push(CharName);
      }
    }

    //prepare the number list
    if (!CharNumber) {
      throw new Error(`No skin found in ${item}`);
    }
    let N_END = CharNumber.toString().slice(-2);
    if (!xml2 || N_END < 11) {
      N_END = "01";
    }
    CharHeadNumbers.push(CharNumber.toString().slice(0, -2) + N_END);

    //push to list of loaded character stats
    characters.push(statsData);
    writeProgress(((++progressPoints) / operations) * 100);
  });

  //begin generating herostat
  let herostat = CHAR_START[FORMAT];
  const comma = {
    JSON: ",",
    XML: ""
  };
  if (xml2) {
    //xml2 always has defaultman
    herostat += DEFAULTMAN_XML2[FORMAT] + comma[FORMAT] + "\n";
  } else if (options.rosterHack || characters.length < DEFAULT_HEROLIMIT) {
    //for mua, add defaultman, unless no roster hack is installed and all 27 character slots are filled
    herostat += DEFAULTMAN[FORMAT] + comma[FORMAT] + "\n";
  }
  writeProgress(((++progressPoints) / operations) * 100);

  //adapt and add each character's stats to herostat
  characters.forEach((item, index) => {
    //find and replace menulocation in stat with actual menulocation
    const heroValue = (!xml2)
      ? item.replace(MENULOCATION_REGEX, `$1${menulocations[index]}$3`)
      : item;
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
  });

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
    path.resolve(dataPath, options.herostatName)
  );
  writeProgress(((++progressPoints) / operations) * 100);

  //the remaining files will all be in JSON format
  FORMAT = "JSON";

  //start writing charinfo
  if (options.unlocker) {
    let scriptunlock = [];
    if (!xml2) {
      const allChars = startchars.concat(unlockchars, lockchars);
      const unlockNum = Math.max(1, Math.min(characters.length, startchars.length + unlockchars.length));
      const startrNum = Math.max(1, Math.min(startchars.length, STARTERS));
      const charinfoNum = Math.min(CHARINFO_LIMIT, characters.length);
      let charinfo = CHARINFO_START;
      for (const [i, CharName] of allChars.entries()) {
        if (i < charinfoNum) {
          let hero = HERO_START + `\n            "name": "${CharName}"`;
          if (i < startrNum) {
            hero += START_GAME;
          }
          if (i < unlockNum) {
            hero += UNLOCKED;
          }
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
        path.resolve(dataPath, options.charinfoName)
      );
    } else {
      scriptunlock = startchars.concat(unlockchars);
    }

    //write remaining unlock characters to script file
    const pyPath = path.resolve(options.gameInstallPath, "scripts", "menus", options.newGamePyName);
    const hardPyPath = pyPath.slice(0, -3) + "_hard.py";
    const unlockScriptlines = [];
    //write the character unlocks
    for (const CharName of scriptunlock) {
      unlockScriptlines.push(`unlockCharacter("${CharName}", "" )`);
    }
    //XML2 only: add the skin unlocks if selected
    if (options.unlockSkins && xml2) {
      //the skin categories for XML2
      const skinCategoryList = ["astonishing", "aoa", "60s", "70s", "weaponx", "future", "winter", "civilian"];
      for (const skinCategory of skinCategoryList) {
        unlockScriptlines.push(`unlockCharacter("", "${skinCategory}" )`);
      }
    }
    //write to new_game.py
    if (fs.existsSync(pyPath)) {
      writeUnlockScripts(pyPath, unlockScriptlines);
    }
    //XML2 uses a new_game_hard.py script in addition to new_game.py. Duplicate changes are added to this file.
    if (xml2 && fs.existsSync(hardPyPath)) {
      writeUnlockScripts(hardPyPath, unlockScriptlines);
    }
  }

  writeProgress(((++progressPoints) / operations) * 100);

  //constant characters_heads pieces
  const CHARACTERS_HEADS_START = (xml2 && platform === "Console")
    ? ``
    : (platform === "Console")
      ? `ui/models/m_team_stage.igb ui/models/m_team_stage.igb model
`
      : (xml2)
        ? `{
    "packagedef": {`
        : `{
    "packagedef": {
        "shared_powerups": {
            "filename": "data/shared_powerups"
        },
        "model": {
            "filename": "ui/models/m_team_stage"
        },`;
  const CHARACTERS_HEADS_END = (xml2 && platform === "Console")
    ? `ui/models/m_team_roster_screen.igb ui/models/m_team_roster_screen.igb model
`
    : (platform === "Console")
      ? `data/shared_powerups.xmlb data/shared_powerups.xmlb shared_powerups
`
      : (xml2)
        ? `
        "model": {
            "filename": "ui/models/m_team_roster_screen"
        }
    }
}`
        : `
    }
}`;

  //begin writing characters_heads package
  const CHFolder = xml2 ? "characters" : options.mannequinFolder;
  CharHeadNumbers.unshift(xml2 ? "9999" : "0000");

  let charactersHeads = CHARACTERS_HEADS_START;
  CharHeadNumbers.forEach((item) => {
    const CHARACTERS_HEADS_ENTRY = (platform === "Console")
      ? `ui/models/${CHFolder}/${item}.igb ui/models/${CHFolder}/${item}.igb model
`
      : `
        "model": {
            "filename": "ui/models/${CHFolder}/${item}"
        },`;
    charactersHeads += CHARACTERS_HEADS_ENTRY;
  });
  //remove the last comma for MUA1, because it has no more entries
  if (!xml2 && platform !== "Console") {
    charactersHeads = charactersHeads.slice(0, -1);
  }
  charactersHeads += CHARACTERS_HEADS_END;

  //write characters_heads to disk and copy to final location
  const CharHeadTemp = path.resolve("temp", "characters_heads.xmlb");
  let CharHead = null;
  if (platform === "Console") {
    CharHead = path.resolve(options.gameInstallPath, "characters_heads.fb.cfg");
    fs.writeFileSync(CharHeadTemp, charactersHeads);
  } else {
    const CharHeadFolder = path.resolve(options.gameInstallPath, "packages", "generated", "maps", "package", "menus");
    if (!fs.existsSync(CharHeadFolder)) {
      fs.mkdirSync(CharHeadFolder, { recursive: true });
    }
    CharHead = path.resolve(CharHeadFolder, options.charactersHeadsPackageName);
    compileRavenFormats(charactersHeads, "characters_heads", "json");
  }
  fs.copyFileSync(CharHeadTemp, CharHead);

  //clear temp folder if not saving temp files
  if (!options.saveTempFiles) {
    fs.removeSync("temp");
  }
  if (options.showProgress) {
    writeProgress(((++progressPoints) / operations) * 100);
  } else {
    console.log("Done");
  }

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
    "./json2xmlb",
    [dPath, cPath],
    {}
  );
  if (child.stderr && child.stderr.length !== 0) {
    throw new Error(`${dPath}:\n${child.stderr.toString("utf8").split("\n").slice(-3).join("\n")}`);
  }
}

function writeUnlockScripts(filename, unlocks) {
  const newScriptlines = [];
  const lastScriptlines = [];
  const unlockScriptFile = path.resolve("temp", "new_game.py");
  const scriptFile = fs.readFileSync(filename, "utf8");
  const scriptlines = scriptFile.split(/\r?\n/m);
  //copy other script lines that are not unlocks
  let last = false;
  for (const scriptline of scriptlines) {
    if (!scriptline.match(/unlockCharacter\(/i)) {
      if (scriptline.match(/^\s*(loadZoneAddTeam|loadMapStartGame)/i) || last) {
        lastScriptlines.push(scriptline);
        last = true;
      } else {
        newScriptlines.push(scriptline);
      }
    }
  }
  Array.prototype.push.apply(newScriptlines, unlocks.concat(lastScriptlines));
  fs.writeFileSync(unlockScriptFile, newScriptlines.join("\r\n"));
  fs.copyFileSync(unlockScriptFile, filename);
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
