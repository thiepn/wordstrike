from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "js/practiceLab/practiceAbilityObservation.js"
text = path.read_text()
old = '''  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: core.wpm,
    rawWpm: core.rawWpm,
    accuracy: core.accuracy,
    activeDurationMs: core.activeDurationMs,
    typedCharacterCount: core.typedCharacterCount,
'''
new = '''  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
'''
if old not in text:
    raise SystemExit("malformed PL13 adjusted-performance core call not found")
path.write_text(text.replace(old, new, 1))
Path(__file__).unlink()
print("PL13 adjusted-performance staging refactor repaired")
