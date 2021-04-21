#!/usr/bin/env node

const fs = require("fs-extra");
const path = require("path");
const glob = require("glob");
const cspawn = require("cross-spawn");
const minimist = require("minimist");
const sevenBin = require("7zip-bin");
const node7z = require("node-7z");
const { exit } = require("process");

//must be before importing pkg/pkgFetch for rcedit cache replacement to work
process.env.PKG_CACHE_PATH = path.resolve('.pkg-cache');
const pkg = require("pkg");
const pkgFetch = require("pkg-fetch");
const rcedit = require("rcedit");

const PATH_TO_7ZIP = sevenBin.path7za;

const PYTHON_EXE_VERSION_CONFIG_TEMPLATE_FILE = "python_exe_version_config_template.py";
const MAIN_ICON_FILE_NAME = "SHIELD_Logo.ico";
const MAIN_AUTHOR_STRING = "TheRealPSV @ GitHub/Tony Stark @ MarvelMods";

const main = async () => {
  const args = minimist(process.argv.slice(2));

  //clean
  if (args.c) {
    fs.removeSync(path.resolve("build"));
    fs.removeSync(path.resolve("dist"));
    fs.removeSync(path.resolve("temp"));
    fs.removeSync(path.resolve(".pkg-cache"));
    fs.removeSync(path.resolve("python_source", "__pycache__"));
    fs.readdirSync("./").filter((item) => item.toLowerCase().endsWith(".exe.spec")).forEach(item => fs.removeSync(path.resolve(item)));
    exit(0);
  }

  //package existing build folder
  if (args.p) {
    fs.mkdirSync(path.resolve("temp"));
    fs.copySync(path.resolve("build"), path.resolve("temp", "OpenHeroSelect"), { recursive: true });
    fs.mkdirSync("dist");
    const zipStream = node7z.add(path.resolve("dist", "OpenHeroSelect.7z"), path.resolve("temp", "OpenHeroSelect"),
      {
        recursive: true,
        $bin: PATH_TO_7ZIP
      });
    await streamToPromise(zipStream);
    fs.removeSync(path.resolve("temp"));
    exit(0);
  }

  if (args.t) {
    console.log("building targets: " + args.t);
  } else {
    console.log("building all targets");
  }

  //splitter
  if (!args.t || args.t.includes("splitter")) {
    console.log("building splitter");
    const description = "Splits herostat.cfg from old versions of OpenHeroSelect into a roster.cfg and individual xml stats files.";
    await runPkg("splitter.js", MAIN_ICON_FILE_NAME, description, MAIN_AUTHOR_STRING, "OldConfigSplitter.exe");
  }

  //ohs
  if (!args.t || args.t.includes("ohs")) {
    console.log("building ohs");
    const description = "The main OpenHeroSelect program.";
    await runPkg("index.js", MAIN_ICON_FILE_NAME, description, MAIN_AUTHOR_STRING, "OpenHeroSelect.exe");
  }

  //xml2json
  if (!args.t || args.t.includes("xml2json")) {
    console.log("building xml2json");
    const description = "Converts xml files to json files.";
    await runPyInstaller("xml to json converter (BaconWizard17).py", MAIN_ICON_FILE_NAME, description, "BaconWizard17 @ MarvelMods", "xml2json.exe");
  }

  //json2xmlb
  if (!args.t || args.t.includes("json2xmlb")) {
    console.log("building json2xmlb");
    const description = "Converts between json files and xmlb/engb files.";
    await runPyInstaller("xmlb (raven-formats by nikita488).py", MAIN_ICON_FILE_NAME, description, "nikita488 @ MarvelMods", "json2xmlb.exe");
  }

  //copyfiles
  if (!args.t || args.t.includes("copyfiles")) {
    console.log("building copyfiles");
    fs.ensureDirSync(path.resolve("xml"));
    fs.copySync(path.resolve("xml"), path.resolve("build", "xml"), { recursive: true });
    fs.ensureDirSync(path.resolve("json"));
    fs.copySync(path.resolve("json"), path.resolve("build", "json"), { recursive: true });
    fs.copySync(path.resolve("rosters"), path.resolve("build", "rosters"), { recursive: true });
    fs.copySync(path.resolve("menulocations"), path.resolve("build", "menulocations"), { recursive: true });
    fs.copySync(path.resolve("help_files"), path.resolve("build", "help_files"), { recursive: true });
  }
};

function streamToPromise(stream) {
  return new Promise(function (resolve, reject) {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

async function runPkg(SourceJSFileName, iconFileName, fileDescription, author, exeOutputFileName) {
  const pkgTarget = 'latest-win-x64';
  const cacheExe = await downloadCache(pkgTarget);
  await editNodeJSExeData(cacheExe, iconFileName, fileDescription, author);
  await pkg.exec([path.resolve("js_source", SourceJSFileName), "--public", "--targets", pkgTarget, "--output", path.resolve("build", exeOutputFileName)]);
}

async function runPyInstaller(sourcePyFileName, iconFileName, fileDescription, author, exeOutputFileName) {
  const noExtOutputName = path.parse(path.resolve(exeOutputFileName)).name;
  fs.mkdirSync("temp", { recursive: true });
  const versionData = await buildPythonExeVersionData(fileDescription, author);
  fs.writeFileSync(path.resolve("temp", "versiondata.py"), versionData);
  cspawn.sync("pyinstaller", ["--noconfirm", "--onefile", "--console",
    "--distpath", pythonPathResolve("build"), "--specpath", "temp", "--workpath", "temp",
    "--version-file", pythonPathResolve("temp", "versiondata.py"),
    "--icon", pythonPathResolve(iconFileName),
    "-n", pythonPathResolve(exeOutputFileName),
    pythonPathResolve("python_source", sourcePyFileName)], { stdio: 'inherit' });
  fs.removeSync(path.resolve("temp"));
  console.log(path.resolve(`${noExtOutputName}.exe.spec`));
  fs.removeSync(path.resolve(`${noExtOutputName}.exe.spec`));
}

//required for compiling the python files, pyinstaller needs slashes to be escaped
function pythonPathResolve(...strings) {
  return path.resolve(...strings).replaceAll("\\", "\\\\");
}

//needed to work around an issue with rcedit not being able to modify exported nodejs exe
async function downloadCache(pkgTarget) {
  const [nodeRange, platform, arch] = pkgTarget.split('-');
  await pkgFetch.need({ nodeRange, platform, arch });
  const cacheExe = glob.sync(`${process.env.PKG_CACHE_PATH}/**/fetched*`);
  if (cacheExe.length < 1) throw new Error('Error downloading PKG cache');
  return cacheExe[0];
}

//only works for the nodejs files, not the python files
async function editNodeJSExeData(exePath, iconFileName, fileDescription, author) {
  const packageVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"))).version;
  await rcedit(path.resolve(exePath), {
    'product-version': packageVersion,
    'file-version': packageVersion,
    icon: path.resolve(iconFileName),
    'version-string': {
      FileDescription: fileDescription,
      ProductName: 'OpenHeroSelect',
      CompanyName: author,
      LegalCopyright: "",
      OriginalFilename: ""
    }
  });
}

//loads up and generates a version file string to be written to file for python exes since rcedit breaks python exes
async function buildPythonExeVersionData(fileDescription, author) {
  let template = fs.readFileSync(PYTHON_EXE_VERSION_CONFIG_TEMPLATE_FILE, { encoding: 'utf8' });
  const packageVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"))).version.split(".");
  template = template.replaceAll("~version-digit-1~", packageVersion[0]);
  template = template.replaceAll("~version-digit-2~", packageVersion[1]);
  template = template.replaceAll("~version-digit-3~", packageVersion[2]);
  template = template.replaceAll("~product-name~", "OpenHeroSelect");
  template = template.replaceAll("~product-name~", "OpenHeroSelect");
  template = template.replaceAll("~description~", fileDescription.replaceAll("'", "\\'"));
  template = template.replaceAll("~author~", author.replaceAll("'", "\\'"));
  return template;
}

//actual function call, allows for usage of async/await
main();
