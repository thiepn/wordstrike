from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    source = target.read_text()
    if new in source and old not in source:
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"UI3 browser contract anchor mismatch in {path}: count={count}, anchor={old!r}")
    target.write_text(source.replace(old, new, 1))


replace_once(
    "tests/browser/non_practice_regressions.py",
    '    active = page.locator("button.mode-card.available").evaluate_all("els => els.map(e => e.dataset.modeId)")\n',
    '    active = page.locator("button.mode-option.available").evaluate_all("els => els.map(e => e.dataset.modeId)")\n',
)

replace_once(
    "tests/browser/ui1_design_system.py",
    '        geometry = page.locator(".mode-panel").evaluate("""el => {\n',
    '        geometry = page.locator(".mode-screen > :first-child").evaluate("""el => {\n',
)
replace_once(
    "tests/browser/ui1_design_system.py",
    '        bottom_action = page.locator(".mode-menu-action .arcade-button")\n',
    '        bottom_action = page.locator(\'.mode-screen [data-action="mode-title"]\').last\n',
)

print("UI3 prior browser contracts migrated away from retired Mode Select selectors.")
