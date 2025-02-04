import attr
import enum
import json
import parsimonious


grammar = parsimonious.Grammar(r"""

criterion = key (json_value / values)?

values = value splat ("," key value)*
value = nested / string_value / empty
nested = "=[" criterion "]"
splat = ("*")?

number = ~"-?[0-9][0-9_.]*"
key = ~"[a-zA-Z0-9_.^ >%※\n-]+"
empty = ""
json_value = "=" ~"{.+\Z"
string_value = "=" (number / key)

""")


class Sentinels(enum.Enum):
    empty = enum.auto()


class UnknownConstructor(Exception):
    pass


class DuplicateKey(Exception):
    pass


@attr.s
class Constructors:
    pairs = attr.ib(factory=list)
    splat = attr.ib(default=False)


@attr.s
class Constructor:
    name = attr.ib()
    args = attr.ib(default=())
    kwargs = attr.ib(factory=dict)

    def make_from_map(self, constructors):
        return constructors[self.name](*self.args, **self.kwargs)


class CriterionVisitor(parsimonious.NodeVisitor):
    def __init__(self, valid_names=None):
        super().__init__()
        self.__valid_names = valid_names

    def visit_criterion(self, node, children):
        head, [[tail]] = children
        if self.__valid_names is not None and head not in self.__valid_names:
            raise UnknownConstructor(head)

        args = []
        kwargs = {}
        for key, value in tail.pairs:
            if key is None:
                if value is not Sentinels.empty:
                    args.append(value)
            elif key in kwargs:
                raise DuplicateKey(key)
            elif value is Sentinels.empty:
                if tail.splat:
                    args.append(key)
                else:
                    kwargs[key] = True
            else:
                kwargs[key] = value

        return Constructor(head, args, kwargs)

    def visit_values(self, node, children):
        head, splat, tail = children
        pairs = [(None, head)]
        pairs.extend((key, value) for _, key, value in tail)
        return Constructors(pairs, splat)

    def visit_value(self, node, children):
        [value] = children
        return value

    def visit_nested(self, node, children):
        _, nested, _ = children
        return nested

    def visit_splat(self, node, children):
        return len(children) > 0

    def visit_number(self, node, children):
        text = node.text
        if '.' in text:
            return float(text)
        else:
            return int(text)

    def visit_key(self, node, children):
        return node.text

    def visit_empty(self, node, children):
        return Sentinels.empty

    def visit_json_value(self, node, children):
        return Constructors(json.loads(children[-1].text).items())

    def visit_string_value(self, node, children):
        return children[-1][0]

    def generic_visit(self, node, children):
        return children or node


def parse(s, valid_names=None):
    return CriterionVisitor(valid_names).visit(grammar.parse(s))


if __name__ == '__main__':
    import sys
    print(parse(sys.argv[1]))
