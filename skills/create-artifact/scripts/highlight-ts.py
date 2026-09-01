import re, sys, html

KEYWORDS = (
    "const let var export import from return if else switch case default new type "
    "interface enum as await async function void null undefined true false readonly "
    "extends implements class this typeof keyof in of for while break continue throw "
    "try catch finally satisfies declare namespace public private protected static"
).split()

TOKEN = re.compile(
    r"(?P<com>//[^\n]*|/\*[\s\S]*?\*/)"
    r"|(?P<str>'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`)"
    r"|(?P<num>\b\d[\d_]*(?:\.\d+)?\b)"
    r"|(?P<word>[A-Za-z_$][A-Za-z0-9_$]*)"
    r"|(?P<op>[=+\-*/%<>!?:&|^~]+)"
)

CLS = {"com": "t-com", "str": "t-str", "num": "t-num", "op": "t-op"}


def highlight(code):
    out, pos = [], 0
    for m in TOKEN.finditer(code):
        if m.start() > pos:
            out.append(html.escape(code[pos:m.start()]))
        kind = m.lastgroup
        text = m.group()
        esc = html.escape(text)
        if kind == "word":
            after = code[m.end():m.end() + 1]
            if text in KEYWORDS:
                cls = "t-key"
            elif text[0].isupper():
                cls = "t-typ"
            elif after == "(":
                cls = "t-fn"
            else:
                cls = ""
            out.append(f'<span class="{cls}">{esc}</span>' if cls else esc)
        else:
            out.append(f'<span class="{CLS[kind]}">{esc}</span>')
        pos = m.end()
    out.append(html.escape(code[pos:]))
    return "".join(out)


BLOCK = re.compile(r'<pre data-ts>([\s\S]*?)</pre>')

src = open(sys.argv[1]).read()
count = 0


def repl(m):
    global count
    count += 1
    return "<pre>" + highlight(m.group(1)) + "</pre>"


out = BLOCK.sub(repl, src)
sys.stderr.write("highlighted %d TypeScript blocks\n" % count)
sys.stdout.write(out)
