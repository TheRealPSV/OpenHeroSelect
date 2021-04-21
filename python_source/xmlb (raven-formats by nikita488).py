from collections import namedtuple, OrderedDict
from struct import pack, unpack, calcsize
from argparse import ArgumentParser
from pathlib import Path
from glob import glob
import json, os, errno

header_fmt = '< 2I'
header_size = calcsize(header_fmt)

XMLBElement = namedtuple('XMLBElement', [
    'name',
    'next_offset',
    'child_offset',
    'attrs',
    'child_elements'
])

element_fmt = '< I 2i I'
element_size = calcsize(element_fmt)

XMLBElementAttr = namedtuple('XMLBElementAttr', [
    'name',
    'value'
])

attr_fmt = '< 2I'
attr_size = calcsize(attr_fmt)

class XMLBDict(dict):
    def __init__(self, items):
        self['something'] = 'something'
        self._items = items
    def items(self):
        return self._items

class XMLB:
    def __init__(self):
        self.reset()

    def reset(self):
        self.json_elements = []
        self.str_offsets = OrderedDict()
        self.offset = header_size

    def parse_json_object_pairs(self, pairs):
        return pairs

    def value2str(self, value):
        string = str(value)

        if string not in self.str_offsets:
            if string == 'True' or string == 'False':
                string = string.lower()

            self.str_offsets[string] = None

        return string

    def str2value(self, string: str):
        value = None

        try:
            value = int(string)

            if len(str(value)) < len(string):
                value = string
        except ValueError:
            try:
                value = float(string)
            except ValueError:
                if string == 'true' or string == 'false':
                    value = string == 'true'
                else:
                    value = string
        
        return value

    def parse_xmlb_string(self, xmlb_file, offset):
        prev_pos = xmlb_file.tell()
        string = b''

        xmlb_file.seek(offset)
        char = xmlb_file.read(1)

        while char != b'\x00':
            string += char
            char = xmlb_file.read(1)
            
        xmlb_file.seek(prev_pos)

        return string.decode('cp1252')

    def parse_xmlb_attr(self, xmlb_file):
        attr = unpack(attr_fmt, xmlb_file.read(attr_size))
        return (self.parse_xmlb_string(xmlb_file, attr[0]), self.str2value(self.parse_xmlb_string(xmlb_file, attr[1])))

    def parse_xmlb_element(self, xmlb_file, parent_elements: list):
        element = unpack(element_fmt, xmlb_file.read(element_size))
        child_elements = []
        next_elements = []

        for i in range(element[3]):
            child_elements.append(self.parse_xmlb_attr(xmlb_file))

        if element[2] != -1:
            child_elements.append(self.parse_xmlb_element(xmlb_file, next_elements))

        if element[1] != -1:
            parent_elements.append(element[1])

        while next_elements:
            next_elements.pop()
            child_elements.append(self.parse_xmlb_element(xmlb_file, next_elements))

        return (self.parse_xmlb_string(xmlb_file, element[0]), XMLBDict(child_elements))

    def parse_json_element(self, element: list, last: bool):
        name = self.value2str(element[0])
        next_offset = -1
        child_offset = -1
        attrs = []
        child_elements = []
        count = len(element[1]) - 1
        self.offset += element_size
        
        for i, attr in enumerate(element[1]):
            if not isinstance(attr[1], list):
                self.offset += attr_size
                attrs.append(XMLBElementAttr(self.value2str(attr[0]), self.value2str(attr[1])))
            else:
                if child_offset == -1:
                    child_offset = self.offset
                child_elements.append(self.parse_json_element(attr, i == count))

        if not last:
            next_offset = self.offset

        return XMLBElement(name, next_offset, child_offset, attrs, child_elements)

    def append_json_element(self, element: XMLBElement):
        self.json_elements.append(element)

        for child in element.child_elements:
            self.append_json_element(child)

    def decompile(self, in_name: str, out_name: str):
        with open(in_name, 'rb') as xmlb_file:
            header = unpack(header_fmt, xmlb_file.read(header_size))

            if header[0] != 0x11B1:
                raise ValueError('Invalid magic number')

            Path(out_name).parent.mkdir(parents=True, exist_ok=True)

            with open(out_name, 'w', encoding='utf-8') as json_file:
                json.dump(XMLBDict([self.parse_xmlb_element(xmlb_file, None)]), json_file, ensure_ascii=False, indent=4)

    def compile(self, in_name: str, out_name: str):
        with open(in_name, 'r', encoding='utf-8') as json_file:
            data = json.load(json_file, object_pairs_hook=self.parse_json_object_pairs)
            print(data)
            root_count = len(data)

            if root_count != 1:
                raise ValueError('Found {} root elements. Required 1'.format(root_count))

            self.append_json_element(self.parse_json_element(data[0], True))

            for string in self.str_offsets:
                self.str_offsets[string] = self.offset
                self.offset += len(string) + 1

            Path(out_name).parent.mkdir(parents=True, exist_ok=True)

            with open(out_name, 'wb') as xmlb_file:
                xmlb_file.write(pack(header_fmt, 0x11B1, 1))

                for element in self.json_elements:
                    xmlb_file.write(pack(element_fmt, self.str_offsets[element.name], element.next_offset, element.child_offset, len(element.attrs)))

                    for attr in element.attrs:
                        xmlb_file.write(pack(attr_fmt, self.str_offsets[attr.name], self.str_offsets[attr.value]))

                for string in self.str_offsets:
                    xmlb_file.write(pack('{}sx'.format(len(string)), string.encode('cp1252')))

        self.reset()

def main():
    parser = ArgumentParser()
    parser.add_argument('-d', '--decompile', action='store_true', help='decompile input XMLB file to JSON')
    parser.add_argument('input', help='input file (supports glob)')
    parser.add_argument('output', help='output file (wildcards will be replaced by input file name)')
    args = parser.parse_args()
    input_files = glob(args.input)
    xmlb = XMLB()

    if not input_files:
        raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), Path(args.input).name)

    for input_file in input_files:
        output_file = args.output

        if '*' in output_file:
            output_file = output_file.replace('*', Path(input_file).stem)

        if not args.decompile:
            xmlb.compile(input_file, output_file)
        else:
            xmlb.decompile(input_file, output_file)

if __name__ == '__main__':
    main()