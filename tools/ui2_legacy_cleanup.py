from pathlib import Path
import re

path = Path("style.css")
source = path.read_text()

patterns = [
    r"\n\s*\.brand-logo\s*\{[^{}]*\}\n",
    r"\n\s*\.title-panel\s*\{[^{}]*\}\n",
    r"\n\s*\.title-panel \.subtitle\s*\{[^{}]*\}\n",
]

removed = 0
for pattern in patterns:
    source, count = re.subn(pattern, "\n", source)
    removed += count

if ".brand-logo {" in source or ".title-panel {" in source or ".title-panel .subtitle {" in source:
    raise RuntimeError("Residual Title-owned legacy style remains after UI2 cleanup")

path.write_text(source)
print(f"UI2 residual legacy Title cleanup removed {removed} simple rule blocks.")
