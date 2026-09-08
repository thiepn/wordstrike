from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    source = target.read_text()
    if new in source and old not in source:
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"UI3 focus patch anchor mismatch in {path}: count={count}, anchor={old[:100]!r}")
    target.write_text(source.replace(old, new, 1))


replace_once(
    "js/ui.js",
    '''  const focusTarget = selectedIndex === modes.length
    ? app().querySelector(`[data-mode-home-index="${modes.length}"]`)
    : app().querySelector(`[data-mode-index="${selectedIndex}"]`);
  focusTarget?.focus?.({ preventScroll: true });
}
''',
    '''  const focusTarget = selectedIndex === modes.length
    ? app().querySelector(`[data-mode-home-index="${modes.length}"]`)
    : app().querySelector(`[data-mode-index="${selectedIndex}"]`);
  focusTarget?.focus?.({ preventScroll: true });

  // The Mode Select screen owns vertical scrolling on constrained viewports. Keep
  // keyboard-selected rows visible without forcing the initial Campaign view away
  // from the top-of-screen showcase.
  if (focusTarget && selectedIndex > 0) {
    const scrollOwner = app().querySelector(".mode-select-screen");
    const ownerRect = scrollOwner?.getBoundingClientRect?.();
    const targetRect = focusTarget.getBoundingClientRect?.();
    if (scrollOwner && ownerRect && targetRect) {
      const inset = 12;
      if (targetRect.bottom > ownerRect.bottom - inset) {
        scrollOwner.scrollTop += targetRect.bottom - ownerRect.bottom + inset;
      } else if (targetRect.top < ownerRect.top + inset) {
        scrollOwner.scrollTop += targetRect.top - ownerRect.top - inset;
      }
    }
  }
}
''',
)

replace_once(
    "tests/browser/ui3_mode_select.py",
    '''        # Constrained heights must scroll to the sixth keyboard action rather than crush it.
        home = page.locator('[data-mode-home-index="5"]')
        home.scroll_into_view_if_needed()
        page.wait_for_timeout(30)
        box = home.bounding_box()
        assert box is not None, (browser_name, label, "missing Main Menu box")
        assert box["y"] >= -1, (browser_name, label, box)
        assert box["y"] + box["height"] <= height + 1, (browser_name, label, box)

        scroll = page.evaluate("""() => ({
          top: document.scrollingElement?.scrollTop || 0,
          scrollHeight: document.scrollingElement?.scrollHeight || 0,
          clientHeight: document.scrollingElement?.clientHeight || 0,
        })""")

        if browser_name == "chromium" and label in {"mobile", "mobile-keyboard-height"}:
            page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui3-{label}.png"), full_page=True)
''',
    '''        # Capture the initial production composition before exercising scrolling.
        if browser_name == "chromium" and label in {"mobile", "mobile-keyboard-height"}:
            page.screenshot(path=str(ARTIFACTS / f"{browser_name}-ui3-{label}.png"), full_page=True)

        # The screen itself owns vertical scrolling. Drive that actual scroll owner to
        # the end and prove the sixth keyboard action is reachable without shrinking it.
        home = page.locator('[data-mode-home-index="5"]')
        scroll = page.locator(".mode-select-screen").evaluate("""el => {
          el.scrollTop = el.scrollHeight;
          return {
            top: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            overflowY: getComputedStyle(el).overflowY,
          };
        }""")
        page.wait_for_timeout(30)
        box = home.bounding_box()
        assert box is not None, (browser_name, label, "missing Main Menu box")
        assert box["y"] >= -1, (browser_name, label, box)
        assert box["y"] + box["height"] <= height + 1, (browser_name, label, box)
        if scroll["scrollHeight"] > scroll["clientHeight"] + 1:
            assert scroll["top"] > 0, (browser_name, label, scroll)
            assert scroll["overflowY"] in {"auto", "scroll"}, (browser_name, label, scroll)

        # Keyboard navigation must also keep the sixth item visible automatically on
        # constrained mobile layouts. Rerender from the initial state, then move down.
        if label in {"mobile", "mobile-keyboard-height"}:
            open_modes(page, base)
            for _ in range(5):
                page.keyboard.press("ArrowDown")
            assert focused_index(page) == "5", (browser_name, label, focused_index(page))
            keyboard_box = page.locator('[data-mode-home-index="5"]').bounding_box()
            assert keyboard_box is not None, (browser_name, label, "missing focused Main Menu box")
            assert keyboard_box["y"] >= -1, (browser_name, label, keyboard_box)
            assert keyboard_box["y"] + keyboard_box["height"] <= height + 1, (browser_name, label, keyboard_box)
''',
)

print("UI3 focus visibility and scroll-owner certification patch applied.")
