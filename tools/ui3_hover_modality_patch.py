from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"UI3 hover modality anchor mismatch in {path}: {count} for {old!r}")
    target.write_text(source.replace(old, new, 1))


replace_once(
    "js/ui.js",
    "    card.onmouseenter = () => handlers.select?.(index);",
    "    // Preview selection follows deliberate mouse movement, not passive DOM reflow.\n"
    "    // This prevents stationary-pointer hover events from stealing keyboard selection\n"
    "    // when the narrow Mode Select rerenders and scrolls under the cursor.\n"
    "    card.onmousemove = () => handlers.select?.(index);",
)
replace_once(
    "js/ui.js",
    "    titleButton.onmouseenter = () => handlers.select?.(modes.length);",
    "    titleButton.onmousemove = () => handlers.select?.(modes.length);",
)
replace_once(
    "tests/mode-navigation.test.js",
    "app.cards[4].onmouseenter();",
    "app.cards[4].onmousemove();",
)
replace_once(
    "tests/mode-navigation.test.js",
    "footerHome.onmouseenter();",
    "footerHome.onmousemove();",
)
replace_once(
    "tests/ui3-mode-select.test.js",
    "assert.doesNotMatch(ui, /class=\"mode-panel/);",
    "assert.doesNotMatch(ui, /class=\"mode-panel/);\n"
    "assert.match(ui, /card\\.onmousemove = \\(\\) => handlers\\.select\\?\\.\\(index\\)/);\n"
    "assert.match(ui, /titleButton\\.onmousemove = \\(\\) => handlers\\.select\\?\\.\\(modes\\.length\\)/);\n"
    "assert.doesNotMatch(ui, /onmouseenter = \\(\\) => handlers\\.select/);",
)

print("UI3 hover modality fix applied.")
