const SENTENCE_FAMILIES = Object.freeze([
  Object.freeze([
    "A quick morning train crossed the river while the city slowly came to life.",
    "The small workshop stayed quiet as each tool returned to its proper place.",
    "A careful editor moved through the draft and kept every sentence easy to follow.",
    "The narrow path curved past the trees before opening onto a wide field.",
    "A steady routine made the difficult task feel simpler with each repeated attempt.",
    "The bright screen showed a clean page and a short list of ordinary notes.",
    "A patient reader followed the argument without rushing past the important details.",
    "The evening bus moved through light traffic while rain gathered on the windows.",
  ]),
  Object.freeze([
    "The local market opened early and filled the square with quiet conversation.",
    "A focused student reviewed the examples and then solved the next problem alone.",
    "The long hallway stayed cool even as the afternoon sun warmed the outer walls.",
    "A reliable driver checked the route before leaving the crowded city center.",
    "The old clock kept a steady rhythm while the room remained almost silent.",
    "A short message arrived just before the meeting and clarified the final detail.",
    "The open window let in a mild breeze that moved the papers across the desk.",
    "A thoughtful planner compared the options and chose the simplest workable path.",
  ]),
  Object.freeze([
    "The quiet library offered enough space to work without constant interruption.",
    "A practiced musician repeated the difficult passage until the motion felt natural.",
    "The road climbed gently through the hills before dropping toward the next village.",
    "A clean notebook made it easier to separate current tasks from later ideas.",
    "The warm kitchen smelled of fresh bread while the kettle began to boil.",
    "A calm traveler packed only the things needed for the short weekend journey.",
    "The first draft was imperfect but gave the team something concrete to improve.",
    "A simple checklist kept the process moving without adding unnecessary steps.",
  ]),
  Object.freeze([
    "The river moved quickly after the rain and carried small branches downstream.",
    "A curious learner asked one clear question and then tested the answer carefully.",
    "The empty street reflected the shop lights after a brief evening shower.",
    "A steady hand made the small adjustment and returned the machine to normal use.",
    "The meeting ended early because everyone had prepared the important points first.",
    "A clear map helped the group avoid a longer route through unfamiliar streets.",
    "The new routine saved a few minutes each day without making the work feel rushed.",
    "A quiet pause between tasks made it easier to focus on the next useful action.",
  ]),
  Object.freeze([
    "The early sunlight reached the desk and revealed a thin layer of dust on the shelf.",
    "A careful builder measured twice before making the final cut in the wooden board.",
    "The short article explained the idea with plain language and practical examples.",
    "A steady cyclist followed the road along the water and kept an even pace uphill.",
    "The room became quieter as people finished their work and packed their bags.",
    "A useful habit is easier to keep when the next action remains obvious and small.",
    "The second attempt felt smoother because the difficult sequence was now familiar.",
    "A clear signal from the platform announced that the delayed train was approaching.",
  ]),
  Object.freeze([
    "The small cafe filled gradually as commuters stopped for coffee on their way to work.",
    "A focused writer removed the extra sentence and made the paragraph easier to read.",
    "The garden path remained wet after the storm but the sky had already begun to clear.",
    "A patient mechanic listened for the unusual sound before opening the engine cover.",
    "The next page contained a simple diagram that made the earlier explanation clearer.",
    "A calm response prevented a minor mistake from turning into a larger problem.",
    "The final box fit neatly on the shelf and left enough room for the remaining supplies.",
    "A familiar route can still require attention when traffic patterns change unexpectedly.",
  ]),
  Object.freeze([
    "The morning air stayed cool as the first runners passed through the quiet park.",
    "A reliable process reduced guesswork and made the final result easier to inspect.",
    "The light changed quickly as clouds moved across the sun above the open field.",
    "A thoughtful reply addressed the main concern without repeating every earlier detail.",
    "The narrow bridge carried only a few cars at a time across the shallow river.",
    "A steady learner improved faster after separating speed practice from accuracy work.",
    "The desk lamp cast a small circle of light over the notes beside the keyboard.",
    "A short break restored attention before the final section of the task began.",
  ]),
  Object.freeze([
    "The evening train left the station on time and soon moved beyond the outer suburbs.",
    "A clear objective helped the group ignore several interesting but unrelated ideas.",
    "The fresh paint dried quickly because the windows remained open through the afternoon.",
    "A practiced cook prepared the ingredients first and then moved quickly through each step.",
    "The quiet conversation continued while the last customers waited near the counter.",
    "A steady sequence of small corrections produced a cleaner result than one large change.",
    "The path near the lake became narrower where the trees grew close to the water.",
    "A focused final review caught two small errors before the document was sent.",
  ]),
]);

const hashText = (value) => {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

function buildLongForm(sentences, formIndex) {
  const output = [];
  for (let round = 0; round < 18; round += 1) {
    const offset = (round * 3 + formIndex) % sentences.length;
    for (let index = 0; index < sentences.length; index += 1) {
      output.push(sentences[(index + offset) % sentences.length]);
    }
  }
  return output.join(" ");
}

export function selectPracticeBurstSprintsContent({ profileId, contextId, runOrdinal = 0 } = {}) {
  const seed = hashText(`${profileId ?? "profile"}|${contextId ?? "context"}|${runOrdinal}`);
  const formIndex = seed % SENTENCE_FAMILIES.length;
  const text = buildLongForm(SENTENCE_FAMILIES[formIndex], formIndex);
  return Object.freeze({
    formId: `burst-en-${String(formIndex + 1).padStart(2, "0")}`,
    formOrdinal: formIndex + 1,
    formFamilyId: "WS-BURST-EN-1",
    language: "en",
    text,
  });
}
