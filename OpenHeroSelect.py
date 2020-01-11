import re, subprocess, os, getopt, sys

# Main function
def main():
    # get desired number of characters from user
    menuLocations = getMenuLocations()
    # tell user to wait
    print("Generating herostat with " + str(len(menuLocations)) + " characters, please wait...")
    # create data
    dataDict = readHerostatCfg()
    # build herostat.xml
    with open(herostatName + ".xml", "w") as xml:
        xml.write(firstLines)
        # for each character up to the number of menulocations
        for character, menuLocation in zip(dataDict[namesKey], menuLocations):
            if character not in dataDict[statsKey]:
                print("ERROR! Missing stats entry for " + character + "! Aborting!")
                return
            # replace the menulocation placeholder with a value
            for i, line in enumerate(dataDict[statsKey][character]):
                if "[menulocation]" in line:
                    dataDict[statsKey][character][i] = line.replace("[menulocation]", menuLocation)
            xml.writelines(dataDict[statsKey][character])
            xml.write("\n")
        xml.write(endLines)
    # if debug mode, stop here
    if flagDebug:
        print("generated herostat.xml")
        sys.exit(0)
    # compile and move herostat binary files
    generateHerostatBinary(dataDict[dataPathKey])
    # delete herostat.xml
    os.remove(herostatName + ".xml")
    # tell user we're done
    print("Done! Go ahead and launch MUA!")

# Ask user for desired number of characters
def getMenuLocations():
    menuLocations = []
    with open("menulocations.cfg", "r") as cfg:
        for line in cfg:
            if line.strip():
                if not line.strip().startswith('#'):
                    menuLocations.append(line.strip())
        return menuLocations

# Read herostat.cfg file
def readHerostatCfg():
    # open herostat.cfg in read-only mode
    with open("herostat.cfg", "r") as cfg:
        # first line becomes path to data directory in MUA
        dataPath = cfg.readline().strip()

        # read all the names of the characters at the top of the herostat.cfg
        # read until the "-----" (divider between names and stats) is encountered
        names = []
        while True:
            line = cfg.readline()
            if line.strip() == fileDivider:
                break
            elif not line.strip():
                continue
            else:
                names.append(line.strip())

        # read all the stats until the end of the file
        stats = {}
        singleStat = []
        singleStatName = ""
        # this var is used when encountering braces to make sure we don't accidentally close the stat too early (0 means we're on the stat definition level)
        braceLevel = 0
        # this var is to make sure we're inside a stat
        inStat = False
        while True:
            line = cfg.readline()
            # empty line means end of file, finished
            if not line:
                break
            # blank line, useless
            if not line.strip():
                continue
            # comment line, skip
            if line.strip().startswith('#'):
                continue
            # encountering a closing brace that isn't ending the stat definition
            if '}' in line and inStat and braceLevel > 0:
                singleStat.append(line)
                braceLevel -= 1
            # encountering an opening brace that isn't starting the stat definition
            elif '{' in line and inStat:
                singleStat.append(line)
                braceLevel += 1
            # character's name found, start reading into a stat
            elif line.strip() in names:
                singleStatName = line.strip()
            # beginning line of a stat definition found
            elif re.sub(r'\s+', ' ', line).strip() == statBegin.strip():
                singleStat.append(statBegin)
                inStat = True
                braceLevel = 0
            # ending line of a stat definition found, add to stats, then set the singleStatName (current character) to blank so we don't override the existing one
            elif line.strip() == statEnd.strip() and inStat and braceLevel == 0:
                singleStat.append(statEnd)
                stats[singleStatName] = singleStat[:] # copy so the stats version doesn't get modified when the temp one is reset
                singleStat = []
                singleStatName = ""
                inStat = False
            elif "menulocation" in line:
                singleStat.append(menuLocationBegin + "[menulocation]" + " ;\n")
            # not a special line, should just be something inside a stat definition
            elif inStat:
                singleStat.append(line)

        # put everything into a dictionary to return
        dataDict = {
            dataPathKey: dataPath,
            namesKey: names,
            statsKey: stats
        }
        return dataDict

# Generate each herostat binary file and move it to its proper location
def generateHerostatBinary(path):
    for ext in herostatBinaryExts:
        herostatFilename = herostatName + ext
        subprocess.run(["xmlb-compile.exe", "-s", "herostat.xml", herostatFilename])    
        os.replace(herostatFilename, path + herostatFilename)
    return

# debug flag (if true, stop after writing XML file instead of generating xmlb)
flagDebug = False

# help text
helpText = "Usage:\n-d,--debug: stop after writing the xml file instead of making and moving the xmlb file\n-h,--help: display this help text\n"

# command args
unixOptions = "dh"
gnuOptions = ["debug","help"]

# herostat binary filename and extensions
herostatName = "herostat"
herostatBinaryExts = [".xmlb", ".engb", ".itab", ".freb", ".gerb"]

# dataDict return keys
dataPathKey = "dataPath"
namesKey = "names"
statsKey = "stats"

# divider between characters' names and characters' stats
fileDivider = "-----"

# key parts of the herostat.xml
menuLocationBegin = "   menulocation = "
statBegin = "   stats {\n"
statEnd = "   }\n"
firstLines = "XMLB characters {\n\
   stats {\n\
   autospend = support_heavy ;\n\
   body = 1 ;\n\
   characteranims = 00_testguy ;\n\
   charactername = defaultman ;\n\
   level = 1 ;\n\
   menulocation = 0 ;\n\
   mind = 1 ;\n\
   name = default ;\n\
   skin = 0002 ;\n\
   strength = 1 ;\n\
   team = enemy ;\n\
      talent {\n\
      level = 1 ;\n\
      name = fightstyle_default ;\n\
      }\n\
   }\n\
\n\
   stats {\n\
   autospend = support ;\n\
   isteam = true ;\n\
   name = team_character ;\n\
   skin = 0002 ;\n\
   xpexempt = true ;\n\
   }\n\n"
endLines = "}"

if __name__ == '__main__':
    # get command line args
    try:
        fullCmdArguments = sys.argv
        argumentList = fullCmdArguments[1:]
        arguments, values = getopt.getopt(argumentList, unixOptions, gnuOptions)
        for currentArgument, currentValue in arguments:
            if currentArgument in ("-d", "--debug"):
                print("DEBUG MODE")
                flagDebug = True
            elif currentArgument in ("-h","--help"):
                print(helpText)
                sys.exit()
    except getopt.error as err:
        # output error, and return with an error code
        print (str(err))
        print (helpText)
        sys.exit(1)

    # run main function
    try:
        main()
    except Exception as e:
        print(e)
        print(helpText)
        sys.exit(1)