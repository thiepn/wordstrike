from pathlib import Path

path = Path("js/ui.js")
source = path.read_text()
old = '              width="430"\n              height="430"'
new = '              width="360"\n              height="360"'
if new in source and old not in source:
    print("UI2 branding dimensions already preserve the 360x360 intrinsic contract.")
elif source.count(old) == 1:
    path.write_text(source.replace(old, new, 1))
    print("UI2 branding intrinsic dimensions restored to 360x360.")
else:
    raise RuntimeError(f"Expected one UI2 branding dimension anchor, found {source.count(old)}")
