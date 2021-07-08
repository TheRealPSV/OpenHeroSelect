#!/usr/bin/env node

const minimist = require("minimist");
const fs = require("fs-extra");
const path = require("path");

const enquirer = require('enquirer');

const openheroselect = require("./openheroselect");
const splitter = require("./splitter");
const extensionfixer = require("./extensionfixer");

//DO NOT MESS WITH PATH; this path.join must be exactly like this for pkg to pick it up at build time
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const main = async () => {
  //display banner and marvelmods topic link
  console.log(`
 ░█████╗░██████╗░███████╗███╗░░██╗██╗░░██╗███████╗██████╗░░█████╗░░██████╗███████╗██╗░░░░░███████╗░█████╗░████████╗
 ██╔══██╗██╔══██╗██╔════╝████╗░██║██║░░██║██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝██║░░░░░██╔════╝██╔══██╗╚══██╔══╝
 ██║░░██║██████╔╝█████╗░░██╔██╗██║███████║█████╗░░██████╔╝██║░░██║╚█████╗░█████╗░░██║░░░░░█████╗░░██║░░╚═╝░░░██║░░░
 ██║░░██║██╔═══╝░██╔══╝░░██║╚████║██╔══██║██╔══╝░░██╔══██╗██║░░██║░╚═══██╗██╔══╝░░██║░░░░░██╔══╝░░██║░░██╗░░░██║░░░
 ╚█████╔╝██║░░░░░███████╗██║░╚███║██║░░██║███████╗██║░░██║╚█████╔╝██████╔╝███████╗███████╗███████╗╚█████╔╝░░░██║░░░
 ░╚════╝░╚═╝░░░░░╚══════╝╚═╝░░╚══╝╚═╝░░╚═╝╚══════╝╚═╝░░╚═╝░╚════╝░╚═════╝░╚══════╝╚══════╝╚══════╝░╚════╝░░░░╚═╝░░░
`);
  console.log(` VERSION ${process.env.PACKAGE_VERSION}`);
  console.log(" https://marvelmods.com/forum/index.php/topic,10597.0.html\n");

  try {
    //grab args
    const args = minimist(process.argv.slice(2));

    //remove old error log
    fs.removeSync(path.resolve("error.log"));

    //if using the automatic functionality, go straight to ohs
    if (args.a) {
      await openheroselect(true, !!args.x);
      process.exit(0);
    }

    const choices = [
      "Generate Herostat for Marvel: Ultimate Alliance",
      "Generate Herostat for X-Men Legends II",
      "Splitter for Old OHS Config Files",
      "Fix File Extensions"
    ];

    const input = await new enquirer.Select({
      name: 'programfunction',
      message: 'Select a function',
      choices: [...choices] //enquirer will destroy the original array unless we copy it
    }).run();

    console.log(input);

    switch (input) {
      case choices[0]:
        await openheroselect(false, false);
        break;
      case choices[1]:
        await openheroselect(false, true);
        break;
      case choices[2]:
        await splitter();
        break;
      case choices[3]:
        await extensionfixer();
        break;
      default:
        console.error("ERROR: Invalid input");
    }

    await new enquirer.Invisible({
      name: 'close',
      message: 'Press Enter to close'
    }).run();
  } catch (e) {
    fs.writeFileSync("error.log", e.toString() + "\n" + e.stack);
    console.error("Program hit an error, wrote error to error.log");
    process.exitCode = 1;
    await new enquirer.Invisible({
      name: 'close',
      message: 'Press Enter to close'
    }).run();
  }
};

//the actual function call; this allows the main function to use async/await
main();
