#!/usr/bin/env node

require('source-map-support').install();

const fs = require("fs-extra");
const path = require("path");

const MUA_RESOURCES = "mua";
const XML2_RESOURCES = "xml2";

const MENULOCATIONS = "menulocations";
const ROSTERS = "rosters";
const JSON = "json";
const XML = "xml";

const CFG_EXT = "cfg";
const JSON_EXT = "json";
const XML_EXT = "xml";

const main = async () => {
  [
    [path.resolve(MUA_RESOURCES, MENULOCATIONS), CFG_EXT],
    [path.resolve(MUA_RESOURCES, ROSTERS), CFG_EXT],
    [path.resolve(MUA_RESOURCES, JSON), JSON_EXT],
    [path.resolve(MUA_RESOURCES, XML), XML_EXT],
    [path.resolve(XML2_RESOURCES, ROSTERS), CFG_EXT],
    [path.resolve(XML2_RESOURCES, JSON), JSON_EXT],
    [path.resolve(XML2_RESOURCES, XML), XML_EXT]
  ].forEach(filesConfig => {
    if (fs.existsSync(filesConfig[0])) {
      fs.readdirSync(filesConfig[0]).forEach(file => {
        changeFileExt(path.resolve(filesConfig[0], file), filesConfig[1]);
      });
    }
  });
};

function changeFileExt(filePath, newExt) {
  const basename = getBasename(filePath);
  const basepath = path.dirname(path.resolve(filePath));
  if (path.extname(path.resolve(filePath)).slice(1).toLowerCase() === newExt.toLowerCase()) {
    return;
  }
  let fileExists = true;
  let extra = 0;
  let newPath = "";
  while (fileExists) {
    if (extra) {
      newPath = path.resolve(basepath, `${basename}-${extra}.${newExt}`);
    } else {
      newPath = path.resolve(basepath, `${basename}.${newExt}`);
    }
    fileExists = fs.existsSync(newPath);
    if (fileExists) {
      ++extra;
    }
  }
  fs.renameSync(path.resolve(filePath), newPath);
}

function getBasename(filePath) {
  return path.basename(path.resolve(filePath), path.extname(path.resolve(filePath)));
}

module.exports = main;
