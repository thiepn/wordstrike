import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("shared root only relays explicitly marked Diet OAuth callbacks", () => {
  const markerRead = source.indexOf("targetKind = sessionStorage.getItem(TARGET_KEY)");
  const explicitGuard = source.indexOf("if (targetKind !== 'web' && targetKind !== 'native') return;");
  const redirect = source.indexOf("location.replace(target.href)");

  assert.ok(markerRead >= 0, "Diet OAuth marker must be read");
  assert.ok(explicitGuard > markerRead, "Diet callback ownership must be checked after reading the marker");
  assert.ok(explicitGuard < redirect, "unowned callbacks must be rejected before redirecting away from WordStrike");
});

test("WordStrike implicit OAuth fragment is not interpreted as a Diet callback", () => {
  assert.match(source, /const value = key => source\.searchParams\.get\(key\);/);
  assert.doesNotMatch(
    source,
    /new URLSearchParams\(source\.hash\.slice\(1\)\)/,
    "the Diet callback router must never inspect WordStrike's implicit OAuth fragment",
  );
});
