file_name = input('File to Convert with extension (ex: herostat.txt)> ')

# start by opening the file
with open(file_name, mode='r') as file:
    lines_original = []
    # format B does not have blank lines, so they can be removed right away
    for line in file:
        if line.isspace() == False:
            line_fixed = line.strip('\n')
            lines_original.append(line_fixed)

# this is used in the space_remover function so that needed spaces are kept
special_chars = ';= {}'

# need a function to remove all spaces from lines. This makes working with the file easier
def space_remover(old_line):
    new_line = ''
    i = 0
    while i < len(old_line):
        if old_line[i] == ' ':
            if (old_line[i-1] in special_chars) or (old_line[i+1] in special_chars):
                # if the character before or after the space is a special character,
                # then the space can be removed.
                # otherwise it is a string space, not whitespace
                new_line = new_line # had to add this or else code would freak out
            else:
                # this is the string space case. Don't want to remove string spaces
                new_line += old_line[i]
        else:
            # not a space, add as normal
            new_line += old_line[i]
        i += 1
    return new_line

# function to process new lines
def main_converter(old_line):
    new_line = '"'
    for char in old_line:
        if char == '=':
            new_line += '": "'
        elif char == ';':
            new_line += '",'
        elif char == '{':
            new_line += '": {'
        else:
            new_line += char
    return new_line

# unless there is a header, then the indent starts at 8
indent = 8

# these are the lines that will be written to the new file
lines_output = []

code_begun = False

# begin performing conversion
for line in lines_original:
    working_line = space_remover(line)
    if not code_begun:
        # check if we're at the actual beginning of a file, if not then skip lines until we hit it
        if (working_line[0:4] != 'XMLB') and (working_line[-1] == '{'):
            continue
        else:
            code_begun = True
    if working_line[0:4] == 'XMLB':
        # this is for the header
        lines_output.append('{')
        lines_output.append((' ' * 4) + '"' + working_line[5:-1] + '"' + ': {')
    elif working_line == '}':
        # this deals with lines that are closing brackets. Their indent is less than the previous line
        indent -= 4
        lines_output.append((' ' * indent) + '},')
    elif working_line[-1] == '{':
        # this deals with lines with open brackets. They increase the indent
        working_line = main_converter(working_line)
        lines_output.append((' ' * indent) + working_line)
        indent += 4
    else:
        working_line = main_converter(working_line)
        output_line = (' ' * indent) + working_line
        lines_output.append(output_line)
        
# if a full file is being converted, need to add an extra bracket because header is now 2 lines
if lines_output[0] == '{':
    lines_output.append('}')

# if line i is a curly bracket, line i-1 does not need to end in a comma
i = 0
while i < len(lines_output):
    if '}' in lines_output[i]:
        lines_output[i-1] = lines_output[i-1].strip(',')
    i += 1

# this determines the output file name
i = len(file_name)
while i > 0:
    if file_name[i-1] == '.':
        break
    i -= 1
file_name_out = file_name[0:i] + 'json'

# once the conversion is done, you can write it all to the new file        
with open(file_name_out, mode = 'w') as file:
    for line in lines_output:
        file.write(line)
        file.write('\n')
