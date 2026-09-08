# Typing Test

Typing Test uses one fixed benchmark vocabulary:

- Public name: **English 200**
- Internal ID: `english-200`
- Version: `1`
- Source: `data/english200.json`
- Actual approved count: `199`

The English 200 name and ID are intentional even though the approved ordered array contains 199 unique lowercase words. Both `I` and `i` are intentionally absent, and no replacement word was added.

There is no English 1k mode, word-set selector, custom vocabulary, punctuation, numbers, language selection, or difficulty selector.

## Current configurations and presentation

Timed tests: **15, 30, 60, and 120 seconds**. Word tests: **10, 25, 50, and 100 words**. The default is 60 seconds.

Timer position can be **Center** or **Top**. Text size can be **Auto, Small, Medium, or Large** and is stored locally. Desktop keeps a three-row reading window; constrained touch/mobile layouts use two rows. Tab restarts the current test and Escape pauses it.

Time/word-count configuration is locked after a test starts. Timer placement and text size can change during an active run without resetting the attempt.

Generation remains seed-deterministic, avoids immediate duplicates, and extends the queue in shuffled batches. WPM, raw WPM, accuracy, error history, spaces, Backspace behavior, word deletion, and completion timing retain their benchmark semantics.

English 200 results include the word-set identity in the session configuration, normalized result, record namespace, recent summary, and diagnostics. Records without a word-set ID are interpreted as preserved `legacy-common-740` data and never compete with English 200 records.

The existing `data/typingTestWords.json` file remains the unchanged common-vocabulary pool used by other game systems. Campaign, bosses, Endless, and Arcade Rush keep their own gameplay vocabulary contracts.
