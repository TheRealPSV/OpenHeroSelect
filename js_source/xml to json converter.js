#!/usr/bin/env node

// FAKE XML TO JSON CONVERTER BY BACONWIZARD17
// Notes by ak2yny:
// Currently a mere copy + conversion of the Python code.
// Some code can be combined or replaced with regex.

require('source-map-support').install();

function main(str) {
  const linesOut = [];
  let indent = 8;
  const data = str.split("\n");
  data.forEach((line) => {
    // format B does not have blank lines, so they can be skipped
    if (line !== null && line.match(/\S/)) {
      // leading (indent) and trailing spaces can be removed
      let workingLine = line.trim();
      // begin performing conversion
      if (workingLine.slice(0, 4) === 'XMLB' && workingLine.slice(-1) === '{') {
        // this is for the header
        linesOut.push(`{`);
        linesOut.push(` `.repeat(4) + `"` + workingLine.slice(4, -1).trim() + `": {`);
      } else if (workingLine === '}') {
        // this deals with lines that are closing brackets. Their indent is less than the previous line
        indent -= 4;
        // previous line does not need to end in a comma (Note: Original Python code should work as well but I couldn't test it)
        linesOut.splice(-1, 1, linesOut.at(-1).replace(/,$/, ''));
        linesOut.push(` `.repeat(indent) + `},`);
      } else if (workingLine.slice(-1) === '{') {
        // this deals with lines with open brackets. They increase the indent
        workingLine = convertEscape(workingLine);
        linesOut.push(` `.repeat(indent) + workingLine.slice(0, -1).trim() + `": {`);
        indent += 4;
      } else {
        workingLine = convertEscape(workingLine);
        workingLine = workingLine.replace(' = ', '": "');
        if (workingLine.slice(-1) === ';') { workingLine = workingLine.slice(0, -1).trim(); }
        linesOut.push(` `.repeat(indent) + workingLine + `",`);
      }
    }
  });
  // if a full file is being converted, need to add an extra bracket because header is now 2 lines (+ remove previous comma)
  if (linesOut.at(0) === '{') {
    linesOut.splice(-1, 1, linesOut.at(-1).replace(/,$/, ''));
    linesOut.push(`}`);
  }
  return linesOut.join("\n");
}

function convertEscape(oldLine) {
  let newLine = oldLine.replaceAll('\\', '\\\\');
  newLine = newLine.replaceAll('"', '\\"');
  newLine = '"' + newLine;
  return newLine;
}

module.exports = main;
