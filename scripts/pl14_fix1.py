from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "tests/practice-control-frontier.test.js"
text = path.read_text()
old = '''  const stages = [
    { wpm: 90, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 100, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 110, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 120, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 130, accuracy: 99, disfluency: 0.02, correction: 0.01 },
  ];'''
new = '''  const stages = [
    { wpm: 80, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 90, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 100, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 110, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 120, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 130, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 140, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 150, accuracy: 99, disfluency: 0.02, correction: 0.01 },
  ];'''
if old not in text:
    raise SystemExit("frontier fixture anchor missing")
path.write_text(text.replace(old, new, 1))
Path(__file__).unlink()
print("PL14 fixture correction applied")
