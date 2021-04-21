#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");
const prompt = require("prompt-sync")();

const NAME_REGEX = /^[\w-]+$/m;
const SPLITTER_OUTPUT_DIR = "./splitter_output";
const XML_OUTPUT_DIR = path.resolve(SPLITTER_OUTPUT_DIR, "outstats");
const ROSTER_OUTPUT_FILE = path.resolve(SPLITTER_OUTPUT_DIR, "roster.cfg");

const main = async () => {
  try {
    const herostat = fs.readFileSync("./herostat.cfg", { encoding: "utf8" });
    //create output folder
    if (!fs.existsSync(XML_OUTPUT_DIR)) {
      fs.mkdirSync(XML_OUTPUT_DIR, { recursive: true });
    }

    const lines = herostat.split("\n");

    let rosterList = "";

    //get the list of names and find the separator
    let lineNum = 0;
    while (!lines[lineNum].startsWith("-----")) {
      const line = lines[lineNum];
      if (canBeName(line.trim()) && line.trim() !== "defaultman") {
        rosterList += line.trim() + "\n";
      }
      ++lineNum;
    }
    ++lineNum; //move past the separator

    //write roster list
    fs.writeFileSync(ROSTER_OUTPUT_FILE, rosterList);

    let charname = "";
    let stats = "";
    let blockdepth = 0;
    //main loop
    while (lineNum < lines.length) {
      const line = lines[lineNum].trim();
      //blank line or comment line
      if (!line.length || line.trim().startsWith("#")) {
        ++lineNum;
        continue;
      }
      //calculate block depth
      blockdepth = calcDepth(line, blockdepth);
      //name line
      if (!blockdepth && canBeName(line)) {
        writeToFile(charname, stats);
        stats = "";
        charname = line;
        ++lineNum;
        continue;
      }
      //stat line
      stats += line + "\n";
      ++lineNum;
    }
    //write last set to file
    writeToFile(charname, stats);
    prompt("Press enter to close.");
  } catch (e) {
    fs.writeFileSync("error.log", e.toString() + "\n" + e.stack);
  }
};

function canBeName(line) {
  return NAME_REGEX.test(line);
}

function calcDepth(line, blockdepth) {
  const opens = Math.max(0, line.split("{").length - 1);
  const closes = Math.max(0, line.split("}").length - 1);
  return blockdepth + opens - closes;
}

function writeToFile(charname, stats) {
  if (charname && charname !== "defaultman") {
    fs.writeFileSync(path.resolve(XML_OUTPUT_DIR, `${charname}.xml`), stats);
  }
}

//actual function call, allows for usage of async/await
main();
