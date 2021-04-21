#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");
const cspawn = require("cross-spawn");
const minimist = require("minimist");
const prompt = require("prompt-sync")();
const { exit } = require("process");

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
const TEAM_CHARACTER = `"stats": {
  "autospend": "support",
  "isteam": true,
  "name": "team_character",
  "skin": "0002",
  "xpexempt": true
}`;

// PATHS
const INI_PATH = "./config.ini";

const main = async () => {
  try {
    //display banner and marvelmods topic link
    console.log(`
░█████╗░██████╗░███████╗███╗░░██╗██╗░░██╗███████╗██████╗░░█████╗░░██████╗███████╗██╗░░░░░███████╗░█████╗░████████╗
██╔══██╗██╔══██╗██╔════╝████╗░██║██║░░██║██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝██║░░░░░██╔════╝██╔══██╗╚══██╔══╝
██║░░██║██████╔╝█████╗░░██╔██╗██║███████║█████╗░░██████╔╝██║░░██║╚█████╗░█████╗░░██║░░░░░█████╗░░██║░░╚═╝░░░██║░░░
██║░░██║██╔═══╝░██╔══╝░░██║╚████║██╔══██║██╔══╝░░██╔══██╗██║░░██║░╚═══██╗██╔══╝░░██║░░░░░██╔══╝░░██║░░██╗░░░██║░░░
╚█████╔╝██║░░░░░███████╗██║░╚███║██║░░██║███████╗██║░░██║╚█████╔╝██████╔╝███████╗███████╗███████╗╚█████╔╝░░░██║░░░
░╚════╝░╚═╝░░░░░╚══════╝╚═╝░░╚══╝╚═╝░░╚═╝╚══════╝╚═╝░░╚═╝░╚════╝░╚═════╝░╚══════╝╚══════╝╚══════╝░╚════╝░░░░╚═╝░░░
`);
    console.log("https://marvelmods.com/forum/index.php/topic,10597.0.html\n");

    //grab args
    const args = minimist(process.argv.slice(2));

    //clear temp folder
    fs.removeSync("temp");
    fs.mkdirSync("temp", { recursive: true });

    let options = {
      menulocationsValue: null,
      rosterValue: null,
      defaultmanIncluded: null,
      teamcharacterIncluded: null,
      muaPath: null,
      launchGame: null,
      saveTempFiles: null
    };

    let saveOptions = false;
    let skipOptionsPrompts = false;

    let readOptions = null;
    //check for existing config and load it if available
    if (fs.existsSync(INI_PATH)) {
      try {
        readOptions = JSON.parse(fs.readFileSync(INI_PATH, "utf8"));
        options = readOptions;
      } catch (e) {
        console.error("Found malformed config.ini file");
        readOptions = null;
      }
    }

    if (args.a) {
      //run in automatic mode, bypassing option prompts if available
      if (readOptions) {
        console.log("Running in automatic mode, using options below:");
        console.log(JSON.stringify(options, null, 2));
      } else {
        console.error("Missing or malformed config.ini file.");
        exit(1);
      }
    } else {
      //prompt for options
      if (readOptions) {
        //ask to use existing config.ini options if found
        console.log("Found existing saved options below:");
        console.log(JSON.stringify(options, null, 2));
        skipOptionsPrompts =
          prompt("Use saved options from config.ini file? (Y/n): ").trim().toLowerCase() !== "n";
      }

      if (!skipOptionsPrompts) {
        //if config.ini not found, or decided to change options, prompt
        const menulocationOptions = fs.readdirSync("menulocations/")
          .filter((item) => item.toLowerCase().endsWith(".cfg"))
          .map((item) => item.slice(0, item.length - 4));
        console.log("Select a roster layout (default is 27):");
        console.log("  Valid options:");
        menulocationOptions.forEach(item => console.log(`    ${item}`));
        options.menulocationsValue = prompt("  >").trim();
        if (!options.menulocationsValue.trim()) {
          options.menulocationsValue = "27";
        } else if (!menulocationOptions.includes(options.menulocationsValue)) {
          console.error("ERROR: Invalid roster layout");
          exit(1);
        }

        const rosterOptions = fs.readdirSync("rosters/")
          .filter((item) => item.toLowerCase().endsWith(".cfg"))
          .map((item) => item.slice(0, item.length - 4));
        console.log("Select a roster:");
        console.log("  Valid options:");
        rosterOptions.forEach(item => console.log(`    ${item}`));
        options.rosterValue = prompt("  >").trim();
        if (!rosterOptions.includes(options.rosterValue)) {
          console.error("ERROR: Invalid roster");
          exit(1);
        }

        options.defaultmanIncluded =
          prompt("Include defaultman? (Y/n): >").trim().toLowerCase() !== "n";
        options.teamcharacterIncluded =
          prompt("Include team_character? (Y/n): >").trim().toLowerCase() !== "n";
        options.muaPath = path.resolve(prompt("Path to your installation of Marvel Ultimate Alliance (you can just paste this in): >").trim());
        options.launchGame =
          prompt("Launch the game when done? (y/N): >").trim().toLowerCase() === "y";
        options.saveTempFiles =
          prompt("Save the intermediate temp files? (y/N): >").trim().toLowerCase() === "y";
        saveOptions =
          prompt("Save these options to config.ini file? (Y/n): >").trim().toLowerCase() !== "n";
      }

      //write options to config if desired
      if (saveOptions) {
        fs.writeFileSync(INI_PATH, JSON.stringify(options, null, 2));
      }
    }

    //load chosen roster and menulocations
    const menulocationsFile = `menulocations/${options.menulocationsValue}.cfg`;
    const rosterFile = `rosters/${options.rosterValue}.cfg`;

    const rosterData = fs.readFileSync(path.resolve(rosterFile), "utf8");
    const rosterList = rosterData
      .split(WHITESPACE_REGEX)
      .filter((item) => item.trim().length)
      .map((item) => item.trim());

    const menulocationsData = fs.readFileSync(menulocationsFile, "utf8");
    const menulocations = menulocationsData
      .split(WHITESPACE_REGEX)
      .filter((item) => item.trim().length)
      .map((item) => parseInt(item.trim()));

    //load stat data for each character in roster
    const characters = [];
    rosterList.forEach((item) => {
      let fileData = "";
      if (fs.existsSync(`json/${item}.json`)) {
        //if json stats file exists, load that (json has priority)
        fileData = fs.readFileSync(`json/${item}.json`, "utf8");
      } else if (fs.existsSync(`xml/${item}.xml`)) {
        //if json file doesn't exist but xml does, convert to json and load it
        const filePath = `xml/${item}.xml`;
        fs.copyFileSync(filePath, `temp/${item}.xml`);
        const tempFilePath = path.resolve(`temp/${item}.xml`);
        cspawn.sync(path.resolve("xml2json.exe"), [], {
          input: tempFilePath
        });
        if (!options.saveTempFiles) {
          //delete intermediate xml file from temp dir if not saving temp files
          fs.removeSync(tempFilePath);
        }
        fileData = fs.readFileSync(`temp/${item}.json`, "utf8");
      } else {
        console.error(`ERROR: no json or xml found for ${item}`);
        exit(1);
      }

      //clean up loaded json file and push to list of loaded character stats
      fileData = fileData.trim();
      fileData = fileData.slice(0, fileData.length - 1); //removes trailing comma from json

      characters.push(fileData);
    });

    //begin generating herostat
    let herostat = CHARACTERS_START;
    if (options.defaultmanIncluded) {
      herostat += DEFAULTMAN + ",\n";
    }
    if (options.teamcharacterIncluded) {
      herostat += TEAM_CHARACTER + ",\n";
    }

    //adapt and add each character's stats to herostat
    for (let index = 0; index < menulocations.length && index < characters.length; ++index) {
      //find and replace menulocation in stat with actual menulocation
      const heroValue = characters[index].replace(
        MENULOCATION_REGEX,
        `$1${menulocations[index]}$2`
      );
      //append to herostat
      herostat += heroValue;
      //add a trailing comma and newline unless final character
      if (index < menulocations.length - 1) {
        herostat += ",\n";
      }
    }

    //finish writing herostat
    herostat += CHARACTERS_END;

    //clear temp folder if not saving temp files
    if (!options.saveTempFiles) {
      fs.removeSync("temp");
      fs.mkdirSync("temp", { recursive: true });
    }

    //write herostat json to disk
    fs.writeFileSync("temp/herostat.json", herostat);

    const herostatJsonPath = path.resolve("temp/herostat.json");
    const herostatOutputPath = path.resolve("temp/herostat.xmlb");
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
      path.resolve(options.muaPath, "data/herostat.xmlb")
    );
    fs.copyFileSync(
      herostatOutputPath,
      path.resolve(options.muaPath, "data/herostat.engb")
    );
    fs.copyFileSync(
      herostatOutputPath,
      path.resolve(options.muaPath, "data/herostat.freb")
    );
    fs.copyFileSync(
      herostatOutputPath,
      path.resolve(options.muaPath, "data/herostat.gerb")
    );
    fs.copyFileSync(
      herostatOutputPath,
      path.resolve(options.muaPath, "data/herostat.itab")
    );

    //clear temp folder if not saving temp files
    if (!options.saveTempFiles) {
      fs.removeSync("temp");
    }

    //launch game if desired
    if (options.launchGame) {
      const gameProc = cspawn(path.resolve(options.muaPath, "Game.exe"), {
        detached: true
      });
      gameProc.unref();
    } else if (!args.a) {
      prompt("Press enter to close.");
    }
  } catch (e) {
    fs.writeFileSync("./error.log", e.toString() + "\n" + e.stack);
  }
};

//actual function call, allows for usage of async/await
main();
