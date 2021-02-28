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
unixOptions = "dhklv" # Concatenation of modes
gnuOptions = ["debug","help", "keep", "list","verbose"] # List of modes

flagDebug = False   # If true, stop after writing XML file instead of generating xmlb
flagKeep = False    # If true, keep the menupositions from the herostat file
flagList = True    # If true, will print a list showing the rooster and heroes to be loaded
flagVerbose = False # If true, write process information and hints during execution

helpText =  ["USAGE:\n",
            "-h, --help: Display this help text.\n",
            "-d, --debug: Stop after writing the xml file. Will not compile or replace gamefiles.\n",
            "-k, --keep: Keeps the menupositions indicated in the herostat.cfg file.\n",
            "-l, --list: Show the list of characters loaded and their positions in the hero select menu.\n",
            "-v, --verbose: Write process information, warnings, errors & hints.\n",
            "\nFor more help visit the forums!\n"]

knownXMLBErrors = {
            "Data folder not found": "The path to the game data folder in herostat.cfg could not be located.",
            "XML not found": "Something went wrong during the generation of the file (i.e. no write permissions) or the file was removed mid-process.",
            "parm 1 or { [ ( expected": "A capricious error - can sometimes be solved by removing random empty spaces or characters from the herostat.cfg file.",
            "Blank": "A blank error message can occur when having a race condition with xmlb-compiler (try rerunning OPH)"
        }

# Files and Binaries =========================================================

dataPath = None
herostatName = "herostat"
herostatBinaryExts = [".xmlb", ".engb", ".itab", ".freb", ".gerb"]

# Hero Menu ==================================================================
heroPositions50 = [
    "    54  51  48  01  45  46  05  16  17  40  19  42  11  50  58  61    ",
    "    53  37  25  47  03  04  14  06  07  08  22  10  43  49  57  60    ",
    "55  52  35  44  02  13  21  15  18  23  24  09  41  20  12  56  59  62"
]

heroPositions36 = [
    "            48  01  45  46  05  16  17  40  19  42  11  50",
    "            25  47  03  04  14  06  07  08  22  10  43  49",
    "            44  02  13  21  15  18  23  24  09  41  20  12"
]

heroPositions27 = [
    "                 25  03  04  14  06  23  24  09  12",
    "                 01  13  21  15  16  17  26  19  11",
    "                 02  96  05  18  07  08  22  10  20"
]

roosterPositions = {
    "27": heroPositions27,
    "36": heroPositions36,
    "50": heroPositions50
}

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
    page = "https://marvelmods.com/forum/"
    print(f"{Fore.GREEN}{title1}\n{title2}")
    print(f"{Fore.RED}\n\t\t{page}\n")

# Exit function wrapper
def exit(status):
    # Require keypress to avoid fast-closing consoles
    input('\n> Press enter to exit <')
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
            if line == fileDivider:
                break
            elif not line:
                continue
            elif line[:1] == '#':
                continue
            else:
                # Ignore if character is repeated
                if names.count(line) > 0:
                    if flagVerbose: printWarning(f"Multiple entries for hero {line} in namelist")                
                # Ignore if rooster is full and entry is not defaultman
                elif len(names) == maxCharacters and line != "defaultman":
                    if flagVerbose: printWarning(f"Character namelist surpass rooster capacity - {line} will be ignored")
                # Add to list if all is good
                else:
                    names.append(line)                

        # Read all the stats until the end of the file
        stats = {}
        singleStat = []
        singleStatName = ""
        # This var is used when encountering braces to make sure we don't accidentally close the stat too early (0 means we're on the stat definition level)
        braceLevel = 0
        # This var is to make sure we're inside a stat
        inStat = False
        while True:
            line = cfg.readline()
            # Empty line means end of file, finished
            if not line:
                break
            # Blank line, useless
            if not line.strip():
                continue
            # Comment line, skip
            if line.strip().startswith('#'):
                continue
            # Encountering a closing brace that isn't ending the stat definition
            if '}' in line and inStat and braceLevel > 0:
                singleStat.append(line)
                braceLevel -= 1
            # Encountering an opening brace that isn't starting the stat definition
            elif '{' in line and inStat:
                singleStat.append(line)
                braceLevel += 1
            # Character's name found, start reading into a stat
            elif line.strip() in names:
                singleStatName = line.strip()
            # Beginning line of a stat definition found
            elif re.sub(r'\s+', ' ', line).strip() == statBegin.strip():
                singleStat.append(f"{indentation}{statBegin}")
                inStat = True
                braceLevel = 0
            # Ending line of a stat definition found, add to stats, then set the singleStatName (current character) to blank so we don't override the existing one
            elif line.strip() == statEnd and inStat and braceLevel == 0:
                singleStat.append(f"{indentation}{statEnd}")
                stats[singleStatName] = singleStat[:] # copy so the stats version doesn't get modified when the temp one is reset
                singleStat = []
                singleStatName = ""
                inStat = False
            elif "menulocation" in line and not flagKeep:
                singleStat.append(f"{indentation*2}{menuLocationBegin}[menulocation];\n")
            # Not a special line, should just be something inside a stat definition
            elif inStat:
                singleStat.append(f"{indentation}{line}")

        # Put everything into a dictionary to return
        dataDict = {
            namesKey: names,
            statsKey: stats
        }

        printSuccess("> Herostat file succesfully loaded!")
        return dataDict

# Build the herostat.xml for the XMLB compiler
def writeHerostatXML(dataDict, menuLocations):
    # Note that despite the name (which was kept form the original version of OPH)
    # the file generated is not really an XML file.
    # This is simply a file that the xmlb-compile.exe program from NBA2KSTUFF accepts

    with open(herostatName + ".xml", "w") as xml:
        # Write the mandatory opening line
        xml.write(headerLine)
        # For each character up to the number of menulocations
        for character, menuLocation in zip(dataDict[namesKey], menuLocations):
            # Check that the stat entry is present
            if character not in dataDict[statsKey]:
                printError(f"Stats entry for hero: {character} could not be found")
                if flagVerbose: print("> Likely Causes:\n\t - Missing stats entry \n\t - Missing name above stats entry \n\t - Name missmatch between list and stats entry (i.e. typos or caps)")
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
                raise Exception(f"Message from xmlb-compile.exe: \"{Fore.RED + result.stdout.decode('UTF-8')[:-2] + Fore.WHITE}\"")
            
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

# Print a visual representation of the hero rooster
def showRoosterAndList(dataDict, menuLocations, roosterSize):
    # Print a map of the hero positions in the selection menu
    menuMap = roosterPositions[str(roosterSize)]
    print("\n============= Selection menu positions (from 50R images) =============\n")
    print(*menuMap, sep="\n\n")
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
    if "defaultman" in dataDict[namesKey]: numHeroes = numHeroes - 1
    if numHeroes < roosterSize:
        printWarning(f"\nNot having a complete rooster of heroes can cause issues in savefiles ({numHeroes}/{roosterSize})\n")
    else:
        printSuccess(f"\n> Full rooster! ({numHeroes}/{roosterSize})")    

# Main function
def main():
    # Get menu locations from menulocations file
    menuLocations = getMenuLocations()
    roosterSize = len(menuLocations)
    # Tell user to wait
    print("> Generating herostat for [" + str(roosterSize) + "] characters...")
    # Generate hero data dictionary
    dataDict = readHerostatCfg(roosterSize)
    # Generate the "XML" file for the for the compiler
    writeHerostatXML(dataDict, menuLocations)
    
    # Print rooster information and size check if in list mode
    if flagList: showRoosterAndList(dataDict, menuLocations, roosterSize)
    # If debug mode, stop here
    if flagDebug:
        printWarning("! Generated herostat.xml (game not modified)")
        exit(0)

    # Attempt compiling and updating the game herostat binary files
    success = generateHerostatBinary(dataPath)
    # Delete herostat.xml        
    os.remove(herostatName + ".xml")

    if success:
        # Notify user we are done
        printSuccess("\n> SUCCESS! Go ahead and launch MUA!")
    else:
        print(f"\n{Fore.RED}> FAILURE! Something went wrong - try verbose mode to see what's going on!")

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
            if currentArgument in ("-d", "--debug"):
                print("DEBUG MODE")
                flagDebug = True
            elif currentArgument in ("-h","--help"):
                printHeader()
                print(*helpText)
                exit(0)
            elif currentArgument in ("-k","--keep"):
                print("KEEP LOCATION MODE")
                flagKeep = True
            elif currentArgument in ("-l","--list"):
                print("LIST MODE")
                flagList = True
            elif currentArgument in ("-v","--verbose"):
                print("VERBOSE MODE")
                flagVerbose = True
    
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