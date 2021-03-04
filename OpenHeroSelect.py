# General system imports
import os, subprocess, sys, time
# Command-line argument parser
import getopt
# Regular expressions
import re
# Color for command line messages
import colorama
from colorama import Fore, Style

# Argument Variables & Help Texts ============================================
unixOptions = "adehklv" # Concatenation of modes
gnuOptions = ["autostart", "debug", "help", "keep", "list", "verbose"] # List of modes

flagAuto = False    # If true, start MUA.exe upon successful execution of OHS
flagDebug = False   # If true, stop after writing XML file instead of generating xmlb
flagKeep = False    # If true, keep the menupositions from the herostat file
flagList = False    # If true, will print a list showing the roster and heroes to be loaded
flagVerbose = False # If true, write process information and hints during execution

helpText =  ["USAGE:\n",
            "-h, --help: Display this help text.\n",
            "-a, --autostart: Automatically start MUA.exe upon successful execution of OHS.\n",
            "-d, --debug: Stop after writing the xml file. Will not compile or replace gamefiles.\n",
            "-k, --keep: Keeps the menupositions indicated in the herostat.cfg file.\n",
            "-l, --list: Show the list of characters loaded and their positions in the hero select menu.\n",
            "-v, --verbose: Write process information, warnings, errors & hints.\n",
            "\nFor more help visit the forums!\n"]

knownXMLBErrors = {
            "Data folder not found": "The path to the game data folder in herostat.cfg could not be located.",
            "XML not found": "Something went wrong during the generation of the file (i.e. no write permissions) or the file was removed mid-process.",
            "= parm ; expected": "One of the stat entries in the herostat.cfg file is likely malformated (i.e. missing a semicolon, value or equal sign).",
            "parm 1 or { [ ( expected": "A capricious error - can sometimes be solved by removing random empty spaces or characters from the herostat.cfg file.",
            "Blank": "A blank error message can occur when having a race condition with xmlb-compiler (try rerunning OHS)"
        }

# Files and Binaries =========================================================

dataPath = None
herostatName = "herostat"
herostatBinaryExts = [".xmlb", ".engb", ".itab", ".freb", ".gerb"]

# Hero Stat Dictionary Keys ==================================================

namesKey = "names"
statsKey = "stats"

# String Definitions for Parsing herostat.cfg ================================

fileDivider = "-----"
menuLocationBegin = "menulocation = "

# String Definitions for the herostat.xml file ===============================
headerLine = "XMLB characters {\n"
statBegin = "stats {\n"
statEnd = "}"
defaultmanEntry = "stats {\n\
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
}\n\n"
myTeamEntry = "stats {\n\
autospend = support ;\n\
isteam = true ;\n\
name = team_character ;\n\
skin = 0002 ;\n\
xpexempt = true ;\n\
}\n\n"
indentation = "   "
endLine = "}"

# Helper methods =============================================================

# Print a corny header for flair, console separation and link to the forum
def printHeader():
    title1 = "█▀█ █▀█ █▀▀ █▄ █   █ █ █▀▀ █▀█ █▀█   █▀ █▀▀ █   █▀▀ █▀▀ ▀█▀"
    title2 = "█▄█ █▀▀ ██▄ █ ▀█   █▀█ ██▄ █▀▄ █▄█   ▄█ ██▄ █▄▄ ██▄ █▄▄  █ (v2)"
    page = "https://marvelmods.com/forum/index.php/topic,10597.0.html"
    print(f"{Fore.GREEN}{title1}\n{title2}")
    print(f"{Fore.RED}\n{page}\n")
    modes = []
    if flagAuto: modes.append("AUTO-START")
    if flagDebug: modes.append("DEBUG")
    if flagKeep: modes.append("KEEP-POSITIONS")
    if flagList: modes.append("LIST-ROSTER")
    if flagVerbose: modes.append("VERBOSE")
    print (f"> MODES: {', '.join(modes)}")

# Exit function wrapper
def exit(status, keypress=True):
    # Require keypress to avoid fast-closing consoles
    if keypress: input('\n> Press enter to exit <')
    sys.exit(status)

# Print green colored sucess messages
printSuccess = lambda text: print(f"{Fore.GREEN}{text}")
# Print yellow colored warning messages
printWarning = lambda text: print(f"{Fore.YELLOW + Style.BRIGHT }! WARNING: {text}")
# Print red colored error messages
printError = lambda text: print(f"{Fore.RED}! ERROR: {text}")

# Core Function Definitions =================================================

# Read menulocations for the desired number of characters
def getMenuLocations():
    menuLocations = []
    with open("menulocations.cfg", "r") as cfg:
        for line in cfg:
            line = line.strip() # Clean spaces
            if line and not line.startswith('#'):   # If not empty or commented
                menuLocations.append(line)    
    return menuLocations

# Generate select menu mapping from menulocations
def generateSelectionMenuMap(menulocations):
    rows = []
    # This could be made moce concise through a list comprehension
    # but this way the code is more readable for future tweaks
    if len(menulocations) < 50:
        bottomRow = menulocations[::3]
        middleRow = menulocations[1::3]
        topRow = menulocations[2::3]
        rows.append(topRow)
        rows.append(middleRow)
        rows.append(bottomRow)
    else: # The ordering logic is not consistent for the 50R mod
        firstHalf = menulocations[:25]
        secondHalf = menulocations[25:]
        bottomRow = firstHalf[::3] + secondHalf[::3]
        middleRow = firstHalf[2::3] + secondHalf[1::3]
        topRow = firstHalf[1::3] + secondHalf[2::3]
        rows.append(topRow)
        rows.append(middleRow)
        rows.append(bottomRow)

    # Calculate the padding necessary for a print space of 70 chars
    padding = lambda row: round((70 / 2 - (len(row) * 2 - 1)) / 4)
    # Pad rows to be nicely centered in the print space
    rows = [["  "] * padding(row) + row for row in rows]
    return rows

# Read herostat.cfg file
def readHerostatCfg(maxCharacters):
    # Open herostat.cfg in read-only mode
    with open("herostat.cfg", "r") as cfg:
        # Skip over initial comment lines if any until finding datapath
        while True:
            line = cfg.readline()
            if not line.startswith('#'):
                # First non-commented line becomes path to data directory in MUA
                global dataPath
                dataPath = line.strip()
                break

        if flagVerbose:
            # Inform the game datafolder that was found
            print(f"> Game data folder at: {dataPath}")

        # Read the namelist at the top of the herostat.cfg
        # Finish reading when the "-----" (divider between names and stats) is encountered
        # Ignore entries after the maximum number of characters has been reached
        names = []
        while True:
            line = cfg.readline().strip()
            if line == fileDivider: break
            elif not line: continue
            elif line[:1] == '#': continue
            else:
                # Ignore if character is repeated
                if names.count(line) > 0:
                    if flagVerbose: printWarning(f"Multiple entries for hero {line} in namelist")                
                # Ignore if roster is full and entry is not defaultman
                elif len(names) == maxCharacters and line != "defaultman":
                    if flagVerbose: printWarning(f"Character namelist surpass roster capacity - {line} will be ignored")
                # Add to list if all is good
                else:
                    names.append(line)                

        # Read all the stats until the end of the file
        stats = {}
        singleStat = []
        singleStatName = None
        # This var is used when encountering braces to make sure we don't accidentally close the stat too early (0 means we're on the stat definition level)
        braceLevel = 0
        # This var is to make sure we're inside a stat
        inCharacter = False
        inStat = False

        # The order of the checks matters - if you make changes double-check you are handling all cases correctly
        while True:
            # Read in a line
            line = cfg.readline()
            
            # Empty line means end of file, finished
            if not line: break

            # Blank line, useless
            elif not line.strip(): continue

            # Comment line, skip
            elif line.strip().startswith('#'): continue
            
            # Relevant character name found, start reading into a stat
            elif line.strip() in names:
                singleStatName = line.strip()
                inCharacter = True
            
            # Ignore irrelevant character names or entries without a name header
            elif not inCharacter:
                continue

            # Beginning line of a stat definition found
            elif re.sub(r'\s+', ' ', line).strip() == statBegin.strip():
                singleStat.append(f"{indentation}{statBegin}")
                inStat = True
                braceLevel = 0
            
            # Encountering an opening brace that isn't starting the stat definition
            elif inStat and '{' in line:
                singleStat.append(line)
                braceLevel += 1
            
            # Encountering a closing brace that isn't ending the stat definition
            elif '}' in line and inStat and braceLevel > 0:
                singleStat.append(line)
                braceLevel -= 1               

            # Ending line of a stat definition found, add to stats, then set the singleStatName (current character) to blank so we don't override the existing one
            elif line.strip() == statEnd and inStat and braceLevel == 0:
                singleStat.append(f"{indentation}{statEnd}")
                stats[singleStatName] = singleStat[:] # copy so the stats version doesn't get modified when the temp one is reset
                singleStat = []
                singleStatName = ""
                inStat = False
                inCharacter = False

            # Not a special line, should just be something inside a stat definition
            elif inStat:
                # If the stat is menulocation and we want to automatically assign locations            
                if "menulocation" in line and not flagKeep:
                    line = f"{indentation}{menuLocationBegin}[menulocation] ;\n"
                singleStat.append(line)


        # Put everything into a dictionary to return
        dataDict = {
            namesKey: names,
            statsKey: stats
        }

        printSuccess("> Herostat file succesfully loaded!")
        return dataDict

# Build the herostat.xml for the XMLB compiler
def writeHerostatXML(dataDict, menuLocations):
    # Note that despite the name (which was kept form the original version of OHS)
    # the file generated is not really an XML file.
    # This is simply a file that the xmlb-compile.exe program from NBA2KSTUFF accepts

    with open(herostatName + ".xml", "w") as xml:
        # Write the mandatory opening line
        xml.write(headerLine)
        # Write entry for myteam features
        xml.writelines([indentation + line for line in myTeamEntry.splitlines(True)])
        # Append defaultman at end if defaultman was omitted in herostat.cfg
        if "defaultman" not in dataDict[namesKey]: xml.writelines([indentation + line for line in defaultmanEntry.splitlines(True)])
        # For each character up to the number of menulocations
        for character, menuLocation in zip(dataDict[namesKey], menuLocations):
            # Check that the stat entry is present
            if character not in dataDict[statsKey]:
                printError(f"Stats entry for hero: {character} could not be found")
                if flagVerbose: print("> Likely Causes:\n\
                    \t- Missing stats herostat entry \n\
                    \t- Missing name above herostat entry \n\
                    \t- Name missmatch between list and herostat entry (i.e. typos or caps)")
                continue
            
            if flagKeep:
                # Dome some validation on the menulocation entries for each hero
                userLocations = []
                for i, line in enumerate(dataDict[statsKey][character]):
                    if "menulocation" in line:
                        # Get the menulocation enty for the hero
                        location = re.findall(r"\=(.*)\;", line)[0].strip()
                        # Check if the entry is invalid, or has already been used
                        if not location.isdigit():
                            printError(f"Menu position entry for {character} is not numeric! Hero will not show up!")
                        # Check for overlapping positions
                        userLocations.append(location)
                        if (userLocations.count(location) > 0):
                            printWarning(f"Heroes with overlapping at menuposition {location} exist!")
            else:
                # Replace the menulocation placeholder with a values from the list
                for i, line in enumerate(dataDict[statsKey][character]):
                    if "[menulocation]" in line:
                        dataDict[statsKey][character][i] = line.replace("[menulocation]", menuLocation)
            
            # Write the data onto the XML
            xml.writelines(dataDict[statsKey][character])
            xml.write("\n\n")

        # Write the closing line
        xml.write(endLine)
        printSuccess("> XML file succesfully generated!")

# Generate each herostat binary file and move it to its proper location
def generateHerostatBinary(destination_path):
    try:
        # Check that the xml file has been written
        if not os.path.isfile("herostat.xml"):
            raise Exception("Herostat XML file could not be found")

        # Check that the destination path exists
        if not os.path.exists(destination_path):
            raise Exception("Game data folder could not be found")

        # Attempt using xmlb-compile.exe to produce the final game files
        if flagVerbose: printSuccess("> Compiling binary files with xmlb-compile")
        for ext in herostatBinaryExts:
            herostatFilename = herostatName + ext
            result = subprocess.run(["xmlb-compile.exe", "-s", "herostat.xml", herostatFilename], capture_output=True)
            time.sleep(0.2) # Give xmlb-compile.exe a buffer time to finish
            
            if flagVerbose: print(f"\t> {result.stderr.decode('UTF-8')[:-2]}")            
            
            # Check whether the compiler is succesful
            if result.returncode == 1:
                raise Exception(f"Message from xmlb-compile.exe: \"{Fore.RED + result.stdout.decode('UTF-8')[:-2]}\"{Fore.WHITE}")
            
            # If all went well, replace game data files
            os.replace(herostatFilename, destination_path + herostatFilename)

    # Handle possible exceptions
    except Exception as e:
        printError("XMLB files could not be compiled!")
        # Print complete error message and some known issues information
        if flagVerbose:
            printError(e)
            print("\n> Known Errors:")
            [print("\t", f"{error:<30s}", cause) for error, cause in knownXMLBErrors.items()]
        return False

    # Notify user if all went well
    printSuccess("> Gamefiles succesfully updated!")
    return True

# Print a visual representation of the hero roster
def showRosterAndList(dataDict, menuLocations, rosterSize):
    # Print a map of the hero positions in the selection menu
    menuMap = generateSelectionMenuMap(menuLocations)
    print("\n============= Selection menu positions (from 50R images) =============\n")
    print(*["  ".join(row) for row in menuMap], sep="\n\n")
    print("\n======================================================================\n")
        
    # Print a list of the parsed heroes along with their rows and positions
    print("\n> Heroes parsed:")
    for i, (character, menuLocation) in enumerate(zip(dataDict[namesKey], menuLocations), 1):
        if character != "defaultman":
            row = [row for row, rowPositions in enumerate(menuMap, 1) if menuLocation in rowPositions]
            row = row[0] if len(row) > 0 else " "
            print(f"\t{str(i):<3s} {character.capitalize():<24s} Row: {str(row):<10s} Position: {menuLocation}")
        else:
            print("\t-------------------------------------")
            print(f"\t{'-':<3s} {character.capitalize():<20s}")

    numHeroes = len(dataDict[namesKey])
    if "defaultman" in dataDict[namesKey]: numHeroes = numHeroes - 1 # Don't count defaultman when notifying
    if numHeroes < rosterSize:
        printWarning(f"Not having a complete roster of heroes can cause issues in savefiles ({numHeroes}/{rosterSize})\n")
    else:
        printSuccess(f"\n> Full roster! ({numHeroes}/{rosterSize})")    

# Main function
def main():
    # Get menu locations from menulocations file
    menuLocations = getMenuLocations()
    rosterSize = len(menuLocations)
    # Tell user to wait
    print("> Generating herostat for [" + str(rosterSize) + "] characters...")
    # Generate hero data dictionary
    dataDict = readHerostatCfg(rosterSize)
    # Generate the "XML" file for the for the compiler
    writeHerostatXML(dataDict, menuLocations)
    
    # Print roster information and size check if in list mode
    if flagList: showRosterAndList(dataDict, menuLocations, rosterSize)
    # If debug mode, stop here
    if flagDebug:
        printWarning("Generated herostat.xml (GAME NOT MODIFIED)")
        exit(0)

    # Attempt compiling and updating the game herostat binary files
    success = generateHerostatBinary(dataPath)
    # Delete herostat.xml        
    os.remove(herostatName + ".xml")

    if success:
        # Notify user we are done
        if flagAuto:
            printSuccess("\n> STARTING MUA...")
            executable = dataPath[:-6] + "MUA.exe"
            subprocess.Popen(executable)
        else:            
            printSuccess("\n> Go ahead and launch MUA...")
    else:
        if not flagVerbose:
            print(f"\n{Fore.RED}> FAILURE! Something went critically wrong! (Try verbose mode)")
        else:
            print(f"\n{Fore.RED}> FAILURE! Something went critically wrong! (If verbose mode doesn't help, try debug mode & xmlb-compile)")            

# Entry point for program
if __name__ == '__main__':
    # Initialize the command-line color module
    colorama.init(autoreset=True, convert=True)
    try:
        # Parse command line args
        args = sys.argv[1:]
        arguments, values = getopt.getopt(args, unixOptions, gnuOptions)

        # Set mode flags from args
        for currentArgument, currentValue in arguments:
            if currentArgument in ("-a", "--auto"): flagAuto = True
            elif currentArgument in ("-d", "--debug"): flagDebug = True
            elif currentArgument in ("-k","--keep"): flagKeep = True
            elif currentArgument in ("-l","--list"): flagList = True
            elif currentArgument in ("-v","--verbose"): flagVerbose = True
            elif currentArgument in ("-h","--help"):
                printHeader()
                print(*helpText)
                exit(0)
    
    # Handle incorrect args
    except getopt.error as err:
        # Output error, and return with an error code
        print (str(err))
        print (helpText)
        exit(1)

    # Run main function
    try:
        # Print a corny header and link to the forums
        printHeader()
        # Run the main method
        main()
        exit(0)
    except Exception as e:
        print(f"! UNCAUGHT ERROR: {e}")
        exit(1)