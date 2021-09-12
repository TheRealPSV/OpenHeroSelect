#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");
const cspawn = require("cross-spawn");
const enquirer = require('enquirer');

// REGEXES
const WHITESPACE_REGEX = /\s+/m;
const MENULOCATION_REGEX = /(^\s*"menulocation":\s*)"?\w+"?(,\s*$)/m;

// CONSTANT HEROSTAT PIECES
const CHARACTERS_START = `{
  "characters": {
`;
const CHARACTERS_END = `
  }
}
`;
const DEFAULTMAN = `"stats": {
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
}`;

const DEFAULTMAN_XML2 = `"stats": {
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
}`;
const TEAM_CHARACTER = `"stats": {
  "autospend": "support",
  "isteam": true,
  "name": "team_character",
  "skin": "0002",
  "xpexempt": true
}
`;

// CONSTANT VALUES
const DEFAULT_HEROLIMIT = 27;

// PATHS
const INI_PATH = "config.ini";
const MUA_RESOURCES = "mua";
const XML2_RESOURCES = "xml2";

const MUA_NAME = "Marvel Ultimate Alliance";
const XML2_NAME = "X-Men Legends 2";

const main = async (automatic = false, xml2 = false) => {
  const resourcePath = xml2 ? XML2_RESOURCES : MUA_RESOURCES;
  //clear temp folder
  fs.removeSync("temp");
  fs.mkdirSync("temp", { recursive: true });

  //find config file
  const configPath = path.resolve(resourcePath, INI_PATH);

  let options = {};
  if (xml2) {
    options = {
      rosterValue: null,
      gameInstallPath: null,
      exeName: null,
      herostatName: null,
      launchGame: null,
      saveTempFiles: null
    };
  } else {
    options = {
      menulocationsValue: null,
      rosterHack: null,
      rosterValue: null,
      gameInstallPath: null,
      exeName: null,
      herostatName: null,
      launchGame: null,
      saveTempFiles: null
    };
  }

  let saveOptions = false;
  let skipOptionsPrompts = false;

  let readOptions = null;
  //check for existing config and load it if available
  if (fs.existsSync(configPath)) {
    try {
      readOptions = JSON.parse(fs.readFileSync(configPath, "utf8"));
      options = readOptions;
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

      if (!xml2) {
        options.rosterHack = await new enquirer.Confirm({
          name: 'rosterhack',
          message: 'Do you have a roster size hack installed?',
          initial: false
        }).run();

        const menulocationOptions = fs.readdirSync(path.resolve(resourcePath, "menulocations"))
          .filter((item) => item.toLowerCase().endsWith(".cfg"))
          .map((item) => item.slice(0, item.length - 4));
        options.menulocationsValue = await new enquirer.Select({
          name: 'menulocations',
          message: 'Select a roster layout',
          choices: [...menulocationOptions],
          initial: "27"
        }).run();
        if (!options.menulocationsValue.trim()) {
          options.menulocationsValue = "27";
        } else if (!menulocationOptions.includes(options.menulocationsValue)) {
          console.error("ERROR: Invalid roster layout");
          throw new Error("ERROR: Invalid roster layout");
        }
      }

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

      options.gameInstallPath = path.resolve(
        (await new enquirer.Input({
          name: 'installpath',
          message: `Path to your installation of ${xml2 ? XML2_NAME : MUA_NAME} (you can just paste this in, right-click to paste)`,
          initial: xml2 ? "C:\\Program Files (x86)\\Activision\\X-Men Legends 2" : "C:\\Program Files (x86)\\Activision\\Marvel - Ultimate Alliance"
        }).run()
        ).trim());
      options.exeName = (await new enquirer.Input({
        name: 'exename',
        message: `The filename of your game's exe (the default is usually fine unless using a modpack)`,
        initial: xml2 ? "XMen2.exe" : "Game.exe"
      }).run()
      ).trim();
      options.herostatName = (await new enquirer.Input({
        name: 'herostatname',
        message: `The filename of your game's herostat (the default is usually fine unless using a modpack)`,
        initial: "herostat.engb"
      }).run()
      ).trim();
      options.launchGame = await new enquirer.Confirm({
        name: 'launchgame',
        message: 'Launch the game when done?',
        initial: false
      }).run();
      options.saveTempFiles = await new enquirer.Confirm({
        name: 'savetemp',
        message: 'Save the intermediate temp files?',
        initial: false
      }).run();
      saveOptions = await new enquirer.Confirm({
        name: 'teamcharacterincluded',
        message: 'Save these options to config.ini file?',
        initial: true
      }).run();
    }

    //write options to config if desired
    if (saveOptions) {
      fs.writeFileSync(configPath, JSON.stringify(options, null, 2));
    }
  }

  //load chosen roster and menulocations
  const rosterFile = path.resolve(resourcePath, "rosters", `${options.rosterValue}.cfg`);
  const rosterData = fs.readFileSync(path.resolve(rosterFile), "utf8");
  const rosterList = rosterData
    .split(WHITESPACE_REGEX)
    .filter((item) => item.trim().length)
    .map((item) => item.trim());

  let menulocations = [];
  if (!xml2) {
    const menulocationsFile = path.resolve(resourcePath, "menulocations", `${options.menulocationsValue}.cfg`);
    const menulocationsData = fs.readFileSync(menulocationsFile, "utf8");
    menulocations = menulocationsData
      .split(WHITESPACE_REGEX)
      .filter((item) => item.trim().length)
      .map((item) => parseInt(item.trim()));
  }

  //load stat data for each character in roster
  const characters = [];
  rosterList.forEach((item) => {
    let fileData = "";
    if (fs.existsSync(path.resolve(resourcePath, "json", `${item}.json`))) {
      //if json stats file exists, load that (json has priority)
      fileData = fs.readFileSync(path.resolve(resourcePath, "json", `${item}.json`), "utf8");
    } else if (fs.existsSync(path.resolve(resourcePath, "xml", `${item}.xml`))) {
      //if json file doesn't exist but xml does, convert to json and load it
      const filePath = path.resolve(resourcePath, "xml", `${item}.xml`);
      fs.copyFileSync(filePath, path.resolve("temp", `${item}.xml`));
      const tempFilePath = path.resolve("temp", `${item}.xml`);
      cspawn.sync(path.resolve("xml2json.exe"), [], {
        input: tempFilePath
      });
      if (!options.saveTempFiles) {
        //delete intermediate xml file from temp dir if not saving temp files
        fs.removeSync(tempFilePath);
      }
      fileData = fs.readFileSync(path.resolve("temp", `${item}.json`), "utf8");
    } else {
      console.error(`ERROR: no json or xml found for ${item}`);
      throw new Error(`ERROR: no json or xml found for ${item}`);
    }

    //clean up loaded json file and push to list of loaded character stats
    fileData = fileData.trim();
    fileData = fileData.slice(0, fileData.length - 1); //removes trailing comma from json

    characters.push(fileData);
  });

  //workaround for herostat loop since xml2 doesn't use menulocations, and has fixed 21 chars
  if (xml2) {
    menulocations = new Array(21);
  }

  //begin generating herostat
  let herostat = CHARACTERS_START;
  if (xml2) {
    //xml2 always has defaultman
    herostat += DEFAULTMAN_XML2 + ",\n";
  } else if (options.rosterHack || characters.length < DEFAULT_HEROLIMIT || menulocations.length < DEFAULT_HEROLIMIT) {
    //mua add defaultman unless no roster hack is installed and all 27 character slots are filled
    herostat += DEFAULTMAN + ",\n";
  }

  //adapt and add each character's stats to herostat
  for (let index = 0; index < menulocations.length && index < characters.length; ++index) {
    let heroValue = characters[index];
    if (!xml2) {
      //find and replace menulocation in stat with actual menulocation
      heroValue = heroValue.replace(
        MENULOCATION_REGEX,
        `$1${menulocations[index]}$2`
      );
    }
    //append to herostat with comma and newline
    herostat += heroValue + ",\n";
  }

  //add team_character for mua
  if (!xml2) {
    herostat += TEAM_CHARACTER;
  }

  //finish writing herostat
  herostat += CHARACTERS_END;

  //clear temp folder if not saving temp files
  if (!options.saveTempFiles) {
    fs.removeSync("temp");
    fs.mkdirSync("temp", { recursive: true });
  }

  //write herostat json to disk
  fs.writeFileSync(path.resolve("temp", "herostat.json"), herostat);

  const herostatJsonPath = path.resolve("temp", "herostat.json");
  const herostatOutputPath = path.resolve("temp", "herostat.xmlb");
  //generate herostat xmlb file
  const child = cspawn.sync(
    path.resolve("json2xmlb.exe"),
    [herostatJsonPath, herostatOutputPath],
    {}
  );
  if (child.error) {
    throw child.stderr.toString('utf8');
  }

  //copy converted herostat to game data directory
  fs.copyFileSync(
    herostatOutputPath,
    path.resolve(options.gameInstallPath, "data", options.herostatName)
  );

  //clear temp folder if not saving temp files
  if (!options.saveTempFiles) {
    fs.removeSync("temp");
  }

  //launch game if desired
  if (options.launchGame) {
    const gameProc = cspawn(path.resolve(options.gameInstallPath, options.exeName), {
      detached: true
    });
    gameProc.unref();
  }
};

module.exports = main;
