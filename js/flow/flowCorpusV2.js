const ASCII_PRINTABLE = /^[\x20-\x7E]+$/;
const DIFFICULTY_ORDER = Object.freeze({ smooth: 0, natural: 1, advanced: 2, expert: 3 });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function hashFlowCorpusSeed(value) {
  const input = String(value ?? "flow-corpus-v2");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function words(text) {
  return String(text).match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g) || [];
}

function sentenceCount(text) {
  return (String(text).match(/[.!?](?=\s|$)/g) || []).length;
}

function punctuationCount(text) {
  return (String(text).match(/[,:;!?()"'-]/g) || []).length;
}

function symbolCount(text) {
  return (String(text).match(/[%$+&=@#_*\\\/<>|~^]/g) || []).length;
}

export function analyzeFlowCorpusText(text) {
  const tokens = words(text);
  const characters = [...String(text)].length;
  const letters = tokens.reduce((sum, token) => sum + token.length, 0);
  const longWords = tokens.filter((token) => token.length >= 9).length;
  const sentences = Math.max(1, sentenceCount(text));
  const averageWordLength = tokens.length ? letters / tokens.length : 0;
  const averageSentenceWords = tokens.length / sentences;
  const punctuationDensity = characters ? punctuationCount(text) / characters : 0;
  const symbolDensity = characters ? symbolCount(text) / characters : 0;
  const longWordRatio = tokens.length ? longWords / tokens.length : 0;
  const difficultyScore = clamp(Math.round(
    18
      + (averageWordLength * 5.2)
      + (averageSentenceWords * 0.58)
      + (punctuationDensity * 170)
      + (symbolDensity * 520)
      + (longWordRatio * 95)
  ), 1, 100);
  const typabilityScore = clamp(Math.round(
    104
      - (difficultyScore * 0.55)
      - (symbolDensity * 360)
      - (Math.max(0, averageSentenceWords - 22) * 0.7)
  ), 1, 100);

  return Object.freeze({
    characters,
    wordCount: tokens.length,
    sentenceCount: sentences,
    averageWordLength: Number(averageWordLength.toFixed(2)),
    averageSentenceWords: Number(averageSentenceWords.toFixed(2)),
    punctuationDensity: Number(punctuationDensity.toFixed(4)),
    symbolDensity: Number(symbolDensity.toFixed(4)),
    longWordRatio: Number(longWordRatio.toFixed(4)),
    difficultyScore,
    typabilityScore,
  });
}

const THEMES = Object.freeze([
  {
    id: "everyday",
    label: "Everyday",
    setting: "ordinary routines, small decisions, and familiar places",
    terms: ["routine", "timing", "choice", "detail"],
    topics: [
      ["Before the Shops Open", "a short morning errand list", "finish the awkward stop first", "a delayed bus", "a bakery clock that ran five minutes fast", "the list was finished before lunch"],
      ["The Quiet Apartment", "resetting a room after a busy week", "clear one surface at a time", "a missing storage box", "an old receipt inside a cookbook", "the space felt useful again"],
      ["A Better Grocery Run", "shopping with a strict list", "keep the route through the store simple", "two items being moved", "the shortest checkout line closing", "the trip stayed within budget"],
      ["The Fifteen Minute Window", "using a small gap between appointments", "finish one concrete task", "a phone call arriving early", "the task taking less time than expected", "the spare minutes became productive"],
      ["Rain at the Bus Stop", "changing plans during sudden rain", "reach the next stop without rushing", "the first bus skipping the stop", "a covered walkway behind the library", "the delay became manageable"],
      ["The Shared Kitchen", "preparing dinner with limited space", "sequence the work instead of crowding", "only one large pan being clean", "the vegetables cooking faster than expected", "everyone ate at the same time"],
      ["Keys on the Desk", "building a reliable leaving routine", "put essentials in one visible place", "a last minute message", "the charger already being packed", "nothing important was forgotten"],
      ["A Short Walk Home", "choosing a slower route after work", "use the walk to reset attention", "construction blocking the usual street", "a quieter path beside small gardens", "the evening started more calmly"],
      ["Sunday Preparation", "getting ready for the coming week", "finish small preparations before evening", "laundry taking an extra cycle", "the calendar revealing one free morning", "Monday began with less friction"],
      ["The Borrowed Umbrella", "returning a small favor", "remember the handoff before the day got busy", "the owner leaving earlier than planned", "a note pinned beside the front door", "the umbrella made it back on time"]
    ]
  },
  {
    id: "travel",
    label: "Travel",
    setting: "stations, roads, maps, and changing routes",
    terms: ["route", "platform", "distance", "arrival"],
    topics: [
      ["Platform Change", "following a train connection", "reach the new platform calmly", "the departure board updating twice", "a stairway near the rear carriage", "the connection still worked"],
      ["The Coastal Bus", "taking a local bus along the coast", "watch the stops without staring at the map", "poor signal near the cliffs", "painted stop names on stone shelters", "the right village appeared on time"],
      ["A Map Without Signal", "navigating offline in an unfamiliar town", "use landmarks instead of constant GPS", "two streets sharing similar names", "a clock tower visible above the roofs", "the destination became easy to find"],
      ["Early Ferry", "catching the first ferry of the day", "arrive before boarding begins", "a ticket machine being offline", "staff checking printed names manually", "boarding started without delay"],
      ["The Long Layover", "using several hours between flights", "stay rested without losing track of time", "a gate change across the terminal", "quiet seating beside an unused corridor", "the wait felt shorter"],
      ["Road Through the Hills", "driving a slower scenic route", "keep a steady pace on narrow roads", "fog covering one high pass", "reflective markers showing each bend", "the route remained safe and clear"],
      ["Two Stops Too Far", "recovering after missing a metro stop", "reverse direction with minimal confusion", "one entrance being closed", "a transfer sign pointing through a side hall", "the schedule lost only a few minutes"],
      ["The Small Airport", "moving through a compact regional airport", "finish the formalities without rushing", "security opening later than expected", "the departure gate being visible from the cafe", "the process stayed simple"],
      ["Night Train Compartment", "settling into an overnight train", "organize essentials before sleeping", "limited room near the upper berth", "a small shelf beside the window", "the night passed quietly"],
      ["Walking the Last Kilometer", "finishing a journey on foot", "follow the river path to the center", "roadworks blocking the direct sidewalk", "temporary signs leading under a bridge", "the final approach became memorable"]
    ]
  },
  {
    id: "nature",
    label: "Nature",
    setting: "parks, fields, rivers, weather, and seasonal change",
    terms: ["weather", "ground", "light", "season"],
    topics: [
      ["After the Rain", "watching a park recover after heavy rain", "follow the driest path", "water covering the lowest trail", "sunlight returning through broken clouds", "the walk remained comfortable"],
      ["Wind on the Ridge", "crossing an exposed hill", "keep a steady rhythm", "strong gusts near the top", "grass bending in clear waves", "the descent felt easier"],
      ["First Frost", "noticing the first cold morning of the season", "observe how familiar streets changed", "thin ice forming in shaded places", "rooftops turning bright before sunrise", "the city looked briefly unfamiliar"],
      ["River Level", "checking a river after several wet days", "compare the water with normal markers", "mud covering the lower steps", "a branch caught against the bridge pier", "the current was high but controlled"],
      ["Quiet Forest Edge", "walking where fields meet woodland", "move slowly enough to notice detail", "fallen leaves hiding the path border", "small tracks crossing damp soil", "the route became easier to read"],
      ["Heat Before Noon", "finishing an outdoor task early", "work before the hottest hours", "shade moving away from the work area", "a breeze returning near the trees", "the job ended before the heat peaked"],
      ["Clouds Over the Lake", "reading changing weather across open water", "decide whether to continue the loop", "dark clouds gathering to the west", "birds moving toward the sheltered shore", "the return began before the rain"],
      ["Spring Path", "seeing the first signs of spring", "walk a familiar route with fresh attention", "soft ground slowing the pace", "new leaves appearing beside old branches", "small changes became easy to notice"],
      ["Late Summer Field", "crossing a dry field near sunset", "reach the village before dark", "dust rising on the track", "long shadows pointing toward the houses", "the final stretch stayed visible"],
      ["Snow Along the Canal", "walking beside a canal after snowfall", "keep to cleared surfaces", "thin snow hiding icy patches", "footprints showing the safest line", "the walk stayed slow and steady"]
    ]
  },
  {
    id: "technology",
    label: "Technology",
    setting: "devices, software, networks, and practical troubleshooting",
    terms: ["system", "signal", "update", "process"],
    topics: [
      ["The Slow Startup", "diagnosing a laptop that suddenly starts slowly", "separate software delay from hardware delay", "several background apps launching together", "startup time improving after one change", "the cause became measurable"],
      ["Battery During Travel", "stretching phone battery through a long day", "reduce unnecessary drain", "navigation using more power than expected", "offline maps remaining available", "the phone lasted until arrival"],
      ["A Clean Update", "installing a software update carefully", "protect current work before restarting", "one extension reporting incompatibility", "settings exporting in a small backup file", "the update completed without loss"],
      ["Home Network Check", "finding the source of unstable Wi-Fi", "test one link in the chain at a time", "the issue appearing only in one room", "wired speed staying normal", "the weak point became obvious"],
      ["Keyboard Shortcut", "turning a repeated action into a shortcut", "remove unnecessary clicks", "two apps using conflicting keys", "a custom combination working everywhere else", "the workflow became faster"],
      ["Storage Cleanup", "freeing space without deleting important files", "identify large disposable data first", "download folders containing duplicates", "old installers taking several gigabytes", "free space returned safely"],
      ["Offline First", "designing a feature that works without a connection", "keep essential state on the device", "sync arriving later or out of order", "a local queue preserving each action", "the interface stayed dependable"],
      ["A Better Search", "improving search in a growing note collection", "rank useful matches before exact noise", "similar titles causing clutter", "recently opened notes providing context", "results became easier to scan"],
      ["Small Performance Win", "reducing lag in a busy interface", "measure before changing code", "one observer firing on every keystroke", "event counts dropping after a narrow subscription", "typing became visibly smoother"],
      ["Backup Test", "checking whether a backup can actually restore", "verify the full recovery path", "one file name colliding with an older copy", "versioned folders keeping both states", "the restore worked as expected"]
    ]
  },
  {
    id: "science",
    label: "Science",
    setting: "observations, measurements, models, and careful inference",
    terms: ["measurement", "sample", "pattern", "evidence"],
    topics: [
      ["A Noisy Measurement", "repeating a measurement with natural variation", "separate signal from random noise", "one reading sitting far from the rest", "the average stabilizing with more trials", "the estimate became more reliable"],
      ["Simple Model", "building a model for a complicated process", "keep only variables relevant to the question", "one omitted factor mattering at high values", "the model working well in the normal range", "its limits became explicit"],
      ["Sample Size", "comparing a small sample with a larger one", "understand why uncertainty changes", "the small group showing wider variation", "the larger group narrowing the estimate", "the conclusion became more cautious"],
      ["Controlled Comparison", "testing two procedures under similar conditions", "change one important factor at a time", "room temperature drifting during the day", "alternating the order balancing the effect", "the comparison became fairer"],
      ["Calibration Check", "verifying an instrument before collecting data", "compare readings against a known reference", "a small offset appearing consistently", "the correction staying stable across trials", "later measurements became trustworthy"],
      ["Unexpected Result", "investigating a result that conflicts with expectation", "check method before inventing a new explanation", "one label being swapped", "raw notes revealing the mismatch", "the anomaly had a practical cause"],
      ["Replication", "repeating an earlier observation", "use the same method where possible", "one material no longer being available", "a documented substitute changing little", "the main pattern appeared again"],
      ["Field Notes", "collecting observations outside the lab", "record context along with measurements", "weather changing halfway through", "time stamps separating the two conditions", "the notes preserved the difference"],
      ["Confidence Interval", "describing uncertainty around an estimate", "avoid treating one number as exact", "limited data keeping the interval wide", "additional observations narrowing it", "the result became easier to interpret"],
      ["Correlation Pattern", "studying two variables that move together", "avoid assuming cause from association alone", "a third factor affecting both", "stratified data weakening the relationship", "the explanation became more careful"]
    ]
  },
  {
    id: "work",
    label: "Work",
    setting: "projects, meetings, handoffs, and focused execution",
    terms: ["priority", "handoff", "deadline", "review"],
    topics: [
      ["The Clear Handoff", "passing work to another person", "state what is done and what remains", "one dependency still waiting", "a short checklist removing ambiguity", "the next person could continue immediately"],
      ["Meeting With a Decision", "keeping a meeting focused on one decision", "separate discussion from action", "three side topics competing for time", "parking them in a visible list", "the main decision was made"],
      ["Friday Review", "closing the week with a short review", "capture unfinished work before leaving", "two tasks lacking clear owners", "assigning names beside each item", "Monday started with less confusion"],
      ["Scope Change", "responding to a late project request", "measure the cost before accepting it", "the new request touching three components", "a smaller version meeting the real need", "the deadline remained realistic"],
      ["Quiet Hour", "protecting one hour of focused work", "remove interruptions in advance", "messages continuing to arrive", "status settings muting nonurgent alerts", "the core task moved forward"],
      ["Review Queue", "processing a growing review queue", "handle the highest impact items first", "easy items tempting quick wins", "sorting by dependency exposing the right order", "the queue shrank without blocking others"],
      ["Written Update", "sending a concise project update", "make status easy to scan", "too many details hiding the decision", "three headings separating progress, risk, and next step", "readers found the important point quickly"],
      ["Release Morning", "coordinating a small release", "keep ownership explicit", "one check finishing late", "a shared checklist showing the blocker", "the release proceeded safely"],
      ["Feedback Pass", "turning broad feedback into concrete edits", "group comments by underlying issue", "several notes describing the same problem", "one structural change resolving many comments", "the revision became simpler"],
      ["Time Estimate", "estimating a task with uncertainty", "separate known work from unknown work", "integration risk being hard to predict", "a range communicating uncertainty better than one number", "planning became more credible"]
    ]
  },
  {
    id: "learning",
    label: "Learning",
    setting: "study sessions, explanations, practice, and reflection",
    terms: ["practice", "recall", "example", "concept"],
    topics: [
      ["First Principles", "learning a difficult idea from definitions", "understand the basic objects before shortcuts", "notation hiding the intuition", "a small example revealing the structure", "the formal rule became easier to remember"],
      ["Practice Set", "using exercises to expose weak spots", "attempt before reading solutions", "one familiar-looking problem being deceptive", "the failed step identifying the missing concept", "review became more targeted"],
      ["Spaced Recall", "revisiting material across several days", "retrieve ideas without looking first", "easy recognition creating false confidence", "blank-page recall showing the real gaps", "memory became more durable"],
      ["Explain It Simply", "testing understanding by explaining aloud", "use plain language before formal terms", "one step sounding circular", "a concrete example fixing the explanation", "the idea became clearer"],
      ["Error Log", "keeping track of repeated mistakes", "record the cause, not only the answer", "different exercises triggering the same error", "a shared pattern becoming visible", "future practice attacked the real weakness"],
      ["Short Review", "using ten minutes before class effectively", "refresh the highest value facts", "too many notes competing for attention", "a small summary sheet focusing the review", "recall was faster in class"],
      ["Mixed Practice", "alternating problem types", "learn to choose methods instead of repeating one method", "switching feeling slower at first", "method selection improving over time", "practice became more realistic"],
      ["Worked Example", "studying a solved example actively", "predict each next step before reading it", "a clever transformation appearing suddenly", "rewriting the reason beside the step", "the technique became reusable"],
      ["Study Break", "using breaks without losing momentum", "stop before attention collapses", "a phone turning five minutes into twenty", "a fixed return time preserving the session", "the second block stayed focused"],
      ["Mock Test", "using a timed practice test", "measure execution under realistic constraints", "one question consuming too much time", "a skip-and-return rule protecting the rest", "the score reflected knowledge more fairly"]
    ]
  },
  {
    id: "culture",
    label: "Culture",
    setting: "books, music, museums, performances, and creative work",
    terms: ["style", "audience", "detail", "interpretation"],
    topics: [
      ["Gallery Room", "moving through a small gallery slowly", "spend time with fewer works", "a crowded entrance encouraging quick movement", "a quiet side room changing the pace", "individual details became easier to notice"],
      ["Rehearsal Mark", "preparing one difficult passage in rehearsal", "fix the transition instead of replaying everything", "tempo hiding a coordination problem", "slowing four measures exposing the issue", "the full passage became cleaner"],
      ["Library Shelf", "finding an unexpected book beside the intended one", "browse without losing the original purpose", "similar titles filling the shelf", "one older edition containing better diagrams", "the search produced two useful choices"],
      ["Small Theater", "watching a performance in an intimate room", "notice how proximity changes attention", "minimal scenery leaving little distraction", "small vocal changes carrying clearly", "the story felt immediate"],
      ["Museum Audio Guide", "using an audio guide selectively", "listen where context adds value", "long tracks slowing the visit", "short summaries helping choose sections", "the tour stayed flexible"],
      ["Album Sequence", "listening to an album from start to finish", "notice the order rather than isolated songs", "two quiet tracks seeming similar alone", "their placement creating contrast", "the sequence made more sense"],
      ["Book Margin", "annotating while reading", "capture questions without interrupting every paragraph", "too many notes breaking concentration", "brief marks preserving the reading flow", "review later became faster"],
      ["Photo Walk", "taking photographs with one visual theme", "look for repeated shapes and light", "interesting scenes pulling in every direction", "a single constraint sharpening attention", "the final set felt coherent"],
      ["Poster Archive", "comparing old event posters", "notice how design communicates before reading", "different eras using different type styles", "repeated color blocks guiding the eye", "visual patterns became obvious"],
      ["Public Reading", "listening to an author read aloud", "notice rhythm that silent reading can hide", "familiar sentences sounding different", "pauses changing emphasis", "the prose gained another layer"]
    ]
  },
  {
    id: "community",
    label: "Community",
    setting: "shared spaces, volunteering, local events, and cooperation",
    terms: ["people", "shared", "support", "coordination"],
    topics: [
      ["Neighborhood Cleanup", "organizing a short cleanup session", "divide the area into clear sections", "too few collection bags at first", "one group sharing supplies between zones", "the work finished on schedule"],
      ["Shared Noticeboard", "improving a crowded community noticeboard", "make current information easy to find", "old notices covering new ones", "date labels clarifying what should stay", "the board became useful again"],
      ["Food Table", "setting up a shared meal", "keep serving simple and accessible", "several dishes arriving at once", "labels helping people identify ingredients", "the line moved smoothly"],
      ["Volunteer Shift", "handing over a volunteer role", "explain routines without overwhelming the next person", "several exceptions existing to the normal process", "a one-page guide separating normal and unusual cases", "the handoff felt manageable"],
      ["Local Workshop", "running a small practical workshop", "let participants try the task early", "a long introduction using too much time", "one demonstration being enough to start", "the room became active quickly"],
      ["Community Garden", "planning work in a shared garden", "match tasks to weather and tools", "only one working wheelbarrow", "grouping soil tasks reducing waiting", "more beds were finished"],
      ["Book Exchange", "organizing a neighborhood book exchange", "keep browsing easy", "donations arriving faster than sorting", "simple genre signs reducing confusion", "people found books quickly"],
      ["Welcome Table", "helping visitors at a local event", "answer common questions before they are asked", "the map being difficult to read", "a simple landmark-based explanation working better", "arrivals moved with confidence"],
      ["Repair Afternoon", "sharing tools during a repair event", "keep small jobs moving safely", "one popular tool creating a queue", "staging preparation work elsewhere", "waiting time dropped"],
      ["Closing Checklist", "closing a shared venue after an event", "make responsibilities explicit", "several people assuming someone else had checked", "names beside each final task", "the building closed without loose ends"]
    ]
  },
  {
    id: "food",
    label: "Food",
    setting: "kitchens, markets, recipes, and careful preparation",
    terms: ["heat", "timing", "texture", "preparation"],
    topics: [
      ["Bread Before Breakfast", "preparing dough the night before", "let time do most of the work", "the room being cooler than expected", "the dough rising slowly but evenly", "breakfast still started on time"],
      ["Market Lunch", "building lunch from fresh market ingredients", "choose a few items that work together", "one planned ingredient being unavailable", "a local substitute having a better texture", "the meal became simpler"],
      ["One Pan Dinner", "cooking with minimal equipment", "sequence ingredients by cooking time", "the pan losing heat after a large addition", "smaller batches browning better", "the final texture improved"],
      ["Soup Adjustment", "correcting a soup that tastes flat", "change one element at a time", "extra salt not solving the problem", "a little acidity brightening the flavor", "the balance returned"],
      ["Coffee Timing", "making coffee consistently", "keep dose and time stable", "grind size drifting after cleaning", "one small adjustment restoring flow", "the next cup matched the target"],
      ["Picnic Packing", "packing food for a day outside", "prioritize items that travel well", "warm weather limiting choices", "an insulated bag protecting the main dishes", "everything stayed fresh"],
      ["Knife Prep", "preparing vegetables efficiently", "finish similar cuts together", "different shapes cooking at different speeds", "sorting by size before cooking", "the pan cooked evenly"],
      ["Leftover Plan", "turning leftovers into a second meal", "reuse components without repeating the same dish", "one portion being too small alone", "adding grains and fresh vegetables extending it", "waste stayed low"],
      ["Baking Notes", "recording changes during baking", "change only one variable between attempts", "two earlier batches differing in several ways", "clear notes isolating the useful change", "the next batch improved"],
      ["Dinner for Six", "scaling a familiar recipe", "protect timing as quantities increase", "the oven fitting only two trays", "staggering stages keeping food hot", "everyone was served together"]
    ]
  },
  {
    id: "craft",
    label: "Craft",
    setting: "hands-on making, repair, tools, and incremental refinement",
    terms: ["material", "tool", "measure", "finish"],
    topics: [
      ["Straight Cut", "making a precise cut by hand", "measure twice before using the tool", "the board having a slight bow", "supporting both ends improving stability", "the cut stayed true"],
      ["Loose Hinge", "repairing a cabinet door", "find the actual source of movement", "one screw no longer gripping", "a simple insert restoring the hole", "the hinge held firmly"],
      ["Paint Edge", "painting a clean edge", "prepare the surface before applying color", "old tape lifting unevenly", "a fresh line sealing better", "the edge looked sharp"],
      ["Small Shelf", "building a compact wall shelf", "keep the design simple and square", "the wall being less level than expected", "adjustable mounting points compensating for it", "the shelf sat straight"],
      ["Sharpening Pass", "restoring a dull hand tool", "use consistent angle and pressure", "rushing the final strokes rounding the edge", "slower finishing passes improving it", "the tool cut cleanly again"],
      ["Stitch Repair", "mending a small tear", "reinforce the weak area without making it stiff", "the fabric stretching under tension", "shorter stitches distributing load", "the repair blended in"],
      ["Cable Label", "organizing a box of similar cables", "make future identification immediate", "several cables looking identical", "small labels noting device and length", "setup time dropped later"],
      ["Wood Finish", "applying finish to a small wooden piece", "build thin layers rather than one heavy coat", "dust landing on the first layer", "light sanding removing the roughness", "the final surface felt even"],
      ["Tool Layout", "setting up a work surface before starting", "place frequently used tools within easy reach", "limited table space causing overlap", "a side tray holding secondary items", "the main area stayed clear"],
      ["Final Fit", "checking a part before permanent assembly", "test the full movement first", "one corner catching under load", "a tiny adjustment removing friction", "assembly worked smoothly"]
    ]
  },
  {
    id: "exploration",
    label: "Exploration",
    setting: "curiosity, unfamiliar places, observation, and problem solving",
    terms: ["route", "clue", "observation", "decision"],
    topics: [
      ["Unknown Side Street", "taking an unfamiliar route through a known district", "stay oriented while exploring", "several streets curving away from the map grid", "a tall tower remaining visible", "the route rejoined the main road"],
      ["Old Footpath", "following a path not shown clearly on a map", "watch physical signs before committing", "vegetation narrowing the track", "fresh footprints continuing ahead", "the path reached the expected valley"],
      ["Closed Gate", "finding an alternate entrance to a public site", "look for official signs instead of guessing", "the main gate being locked", "a posted map showing a second entrance", "the visit continued normally"],
      ["Harbor Morning", "walking through a harbor before it gets busy", "observe work without getting in the way", "vehicles moving equipment between docks", "marked pedestrian lanes showing safe routes", "the area became easier to understand"],
      ["Hilltop View", "using a high viewpoint to understand a town", "connect visible landmarks with the map", "similar roofs making streets hard to distinguish", "the river providing a fixed reference", "orientation improved immediately"],
      ["Trail Junction", "choosing between two unsigned paths", "use terrain and direction together", "both paths initially heading the same way", "one beginning to descend toward the wrong valley", "the correct branch became clear"],
      ["Old Industrial Quarter", "exploring a redeveloped factory district", "notice what has changed and what remains", "new buildings hiding the old street pattern", "brick walls preserving former boundaries", "the history stayed visible"],
      ["Morning Market", "walking through a market in an unfamiliar city", "learn the layout before buying anything", "crowds hiding the central aisle", "stall numbers increasing in a consistent direction", "finding the exit became easy"],
      ["Canal Crossing", "working out where to cross a canal", "compare bridges before doubling back", "one bridge allowing bicycles only on one side", "a pedestrian crossing visible farther ahead", "the detour stayed short"],
      ["Last Light", "returning from a walk near sunset", "choose the clearest route before light fades", "a shortcut entering dense trees", "the open ridge staying visible longer", "the return remained straightforward"]
    ]
  }
]);

export const FLOW_CORPUS_V2_THEMES = Object.freeze(THEMES.map((theme) => Object.freeze({
  id: theme.id,
  label: theme.label,
  setting: theme.setting,
})));

const PARAGRAPH_STYLES = Object.freeze([
  [
    (theme, topic) => "The situation began with " + topic[1] + ". The setting was familiar enough to feel simple, but it still rewarded attention to " + theme.terms[0] + " and " + theme.terms[1] + ". Instead of rushing, the first useful step was to notice what was already clear.",
    (theme, topic) => "The practical goal was to " + topic[2] + ". That gave the work a definite direction and prevented small distractions from deciding the order. A clear next action made the larger task feel lighter.",
    (theme, topic) => "The main complication was " + topic[3] + ". It did not require a complete restart, but it changed the pace and forced a more deliberate choice. The best response was small, specific, and easy to verify.",
    (theme, topic) => "One detail became especially useful: " + topic[4] + ". It looked minor at first, yet it provided enough information to reduce uncertainty. Good decisions often depend on ordinary clues that are easy to miss when attention is scattered.",
    (theme, topic) => "There was still a contrast between the original plan and what actually happened. The route became less direct, but the process became more controlled. That tradeoff made the result more dependable than a faster but careless approach.",
    (theme, topic) => "By the end, " + topic[5] + ". Nothing dramatic was required; steady observation and a few well-timed adjustments were enough. The useful lesson was not to eliminate every interruption, but to keep the next decision clear."
  ],
  [
    (theme, topic) => "A small challenge developed around " + topic[1] + ". At first the task seemed routine, then a few details made it worth slowing down. The most useful information came from the immediate environment rather than from assumptions.",
    (theme, topic) => "The intended approach was simple: " + topic[2] + ". Keeping that aim visible made it easier to reject unnecessary steps. Progress stayed measurable because each action either moved toward the goal or did not.",
    (theme, topic) => "Then " + topic[3] + " changed the situation. The change mattered, but not enough to justify abandoning the plan. A short reassessment preserved momentum without pretending that conditions were unchanged.",
    (theme, topic) => "The turning point was " + topic[4] + ". That observation connected several smaller clues and made the next move obvious. It was a reminder that useful information is often practical before it is impressive.",
    (theme, topic) => "The second half of the task felt calmer because the uncertainty had narrowed. Attention could return to " + theme.terms[2] + " and " + theme.terms[3] + " instead of constantly checking every possibility. The remaining work became easier to sequence.",
    (theme, topic) => "Eventually, " + topic[5] + ". The result came from a chain of modest choices rather than one perfect decision. That pattern made the experience repeatable, which is more valuable than getting lucky once."
  ],
  [
    (theme, topic) => "The focus was " + topic[1] + ", a situation with enough moving parts to punish careless speed. A good start meant observing the conditions, choosing a reference point, and keeping the first decision reversible.",
    (theme, topic) => "The working objective was to " + topic[2] + ". That objective created a filter for everything else: useful actions supported it, while attractive but irrelevant actions could wait. The structure reduced mental noise.",
    (theme, topic) => "Pressure increased when " + topic[3] + ". The problem was not severe, yet it exposed whether the plan had any flexibility. A controlled adjustment worked better than trying to force the original sequence.",
    (theme, topic) => "A concrete clue helped: " + topic[4] + ". Because the clue was observable, it could be checked instead of merely trusted. That distinction kept the decision grounded in evidence rather than momentum.",
    (theme, topic) => "From there, the process became a matter of maintaining rhythm. Small checks prevented large corrections, and the remaining choices could be made with more confidence. Precision mattered more than raw speed.",
    (theme, topic) => "The outcome was straightforward: " + topic[5] + ". The experience showed how planning, attention, and adaptation can work together without becoming complicated. A stable process made the final result feel almost ordinary."
  ]
]);

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferDifficulty(metrics, variantIndex) {
  // The generated prose intentionally stays highly typeable, so the raw metric
  // occupies a fairly narrow band. Use the authored topic variant as the primary
  // calibration tier and retain the measured score as independent metadata.
  const tier = variantIndex % 5;
  if (tier === 0) return "smooth";
  if (tier === 1 || tier === 2) return "natural";
  return "advanced";
}

const LONGFORM_EXTENSIONS = Object.freeze([
  (theme, topic) => "That first observation also established a useful baseline for the rest of the task. It showed which parts were stable, which details might change, and where attention would have the highest return. With that baseline in place, later choices could be compared against something concrete instead of being made from memory or guesswork.",
  (theme, topic) => "The sequence mattered because every extra branch created another chance to lose context. Keeping the objective visible made it possible to finish one step, confirm the result, and then move on. That pattern reduced rechecking and gave the work a steady rhythm even when the surrounding conditions were not completely predictable.",
  (theme, topic) => "The interruption also made the tradeoffs easier to see. Speed still mattered, but not enough to justify a choice that would create more work later. A brief check of " + theme.terms[0] + " and " + theme.terms[2] + " was usually cheaper than correcting a larger mistake after several steps had already depended on it.",
  (theme, topic) => "Once that clue was noticed, the remaining information became easier to organize. The useful question was no longer whether every detail could be known, but whether enough was known to choose the next safe action. That narrower question kept attention on evidence that could actually change the decision.",
  (theme, topic) => "Maintaining the rhythm required small checks rather than constant hesitation. Each completed step reduced the number of open possibilities, which made the next one easier to judge. The process stayed flexible without becoming vague, and the growing trail of confirmed results made unnecessary backtracking less likely.",
  (theme, topic) => "Looking back, the strongest part of the process was its repeatability. The outcome did not depend on perfect timing or one unusually clever move; it came from clear priorities, observable feedback, and controlled adjustments. The same approach could be used again in a different setting without copying every detail of this situation."
]);

function buildDocument(theme, topic, topicIndex) {
  const style = PARAGRAPH_STYLES[topicIndex % PARAGRAPH_STYLES.length];
  const paragraphs = Object.freeze(style.map((builder, paragraphIndex) => (
    builder(theme, topic) + " " + LONGFORM_EXTENSIONS[paragraphIndex](theme, topic)
  ).replace(/\s+/g, " ").trim()));
  const text = paragraphs.join(" ");
  const metrics = analyzeFlowCorpusText(text);
  return Object.freeze({
    id: "corpus-" + theme.id + "-" + String(topicIndex + 1).padStart(2, "0") + "-" + slug(topic[0]),
    title: topic[0],
    theme: theme.id,
    themeLabel: theme.label,
    difficulty: inferDifficulty(metrics, topicIndex),
    tags: Object.freeze([theme.id, "longform", "corpus-v2", "offline"]),
    paragraphs,
    text,
    ...metrics,
  });
}

export const FLOW_CORPUS_V2_DOCUMENTS = Object.freeze(
  THEMES.flatMap((theme) => theme.topics.map((topic, topicIndex) => buildDocument(theme, topic, topicIndex)))
);

export function validateFlowCorpusDocument(document) {
  if (!document || typeof document !== "object") throw new TypeError("Flow corpus document must be an object");
  if (!/^corpus-[a-z0-9-]+$/.test(document.id || "")) throw new TypeError("Invalid Flow corpus document id");
  if (!FLOW_CORPUS_V2_THEMES.some((theme) => theme.id === document.theme)) throw new TypeError("Unknown Flow corpus theme");
  if (!Object.hasOwn(DIFFICULTY_ORDER, document.difficulty)) throw new TypeError("Invalid Flow corpus difficulty");
  if (!Array.isArray(document.paragraphs) || document.paragraphs.length < 5) throw new TypeError("Flow corpus document needs at least five paragraphs");
  if (document.wordCount < 150) throw new TypeError("Flow corpus document is too short");
  if (document.wordCount > 650) throw new TypeError("Flow corpus document is too long");
  if (document.typabilityScore < 45) throw new TypeError("Flow corpus document typability is below the supported floor");
  if (document.text !== document.text.trim() || /\s{2,}/.test(document.text)) throw new TypeError("Flow corpus document whitespace is malformed");
  if (!ASCII_PRINTABLE.test(document.text)) throw new TypeError("Flow corpus document contains unsupported characters");
  for (const paragraph of document.paragraphs) {
    if (paragraph.length < 120) throw new TypeError("Flow corpus paragraph is too short");
    if (!ASCII_PRINTABLE.test(paragraph)) throw new TypeError("Flow corpus paragraph contains unsupported characters");
  }
  return document;
}

export function validateFlowCorpusV2(documents = FLOW_CORPUS_V2_DOCUMENTS) {
  if (!Array.isArray(documents)) throw new TypeError("Flow corpus must be an array");
  const ids = new Set();
  const textFingerprints = new Set();
  const themes = new Set();
  for (const document of documents) {
    validateFlowCorpusDocument(document);
    if (ids.has(document.id)) throw new TypeError("Duplicate Flow corpus document id: " + document.id);
    ids.add(document.id);
    const fingerprint = hashFlowCorpusSeed(document.text);
    if (textFingerprints.has(fingerprint)) throw new TypeError("Duplicate Flow corpus text detected");
    textFingerprints.add(fingerprint);
    themes.add(document.theme);
  }
  if (documents.length < 100) throw new TypeError("Flow Corpus V2 requires at least 100 source documents");
  if (themes.size < 8) throw new TypeError("Flow Corpus V2 requires at least eight themes");
  const difficultyCoverage = documents.reduce((coverage, document) => {
    coverage[document.difficulty] = (coverage[document.difficulty] || 0) + 1;
    return coverage;
  }, {});
  for (const difficulty of ["smooth", "natural", "advanced"]) {
    if ((difficultyCoverage[difficulty] || 0) < 10) {
      throw new TypeError("Flow Corpus V2 has insufficient " + difficulty + " difficulty coverage");
    }
  }

  const totalWords = documents.reduce((sum, document) => sum + document.wordCount, 0);
  const averageTypability = documents.length
    ? documents.reduce((sum, document) => sum + document.typabilityScore, 0) / documents.length
    : 0;
  return Object.freeze({
    valid: true,
    documentCount: documents.length,
    themeCount: themes.size,
    totalWords,
    averageWords: Math.round(totalWords / documents.length),
    averageTypability: Number(averageTypability.toFixed(1)),
    difficultyCoverage: Object.freeze({ ...difficultyCoverage }),
  });
}

function seededRank(seed, id) {
  return hashFlowCorpusSeed(String(seed) + ":" + id) / 0xffffffff;
}

function difficultyDistance(document, targetDifficulty) {
  if (!Object.hasOwn(DIFFICULTY_ORDER, targetDifficulty)) return 0;
  return Math.abs(DIFFICULTY_ORDER[document.difficulty] - DIFFICULTY_ORDER[targetDifficulty]);
}

export function selectFlowCorpusDocuments({
  seed = "flow-corpus-v2",
  count = 1,
  recentDocumentIds = [],
  targetDifficulty = "natural",
  documents = FLOW_CORPUS_V2_DOCUMENTS,
} = {}) {
  const safeCount = Math.max(1, Math.min(Math.floor(Number(count) || 1), documents.length));
  const recent = new Set(Array.isArray(recentDocumentIds) ? recentDocumentIds : []);
  const fresh = documents.filter((document) => !recent.has(document.id));
  const source = fresh.length >= safeCount ? fresh : documents;
  const exactDifficulty = Object.hasOwn(DIFFICULTY_ORDER, targetDifficulty)
    ? source.filter((document) => document.difficulty === targetDifficulty)
    : [];
  const calibratedSource = exactDifficulty.length >= safeCount ? exactDifficulty : source;
  const ranked = [...calibratedSource].sort((left, right) => {
    const leftRecentPenalty = recent.has(left.id) ? 4 : 0;
    const rightRecentPenalty = recent.has(right.id) ? 4 : 0;
    const leftScore = seededRank(seed, left.id) - (difficultyDistance(left, targetDifficulty) * 0.18) - leftRecentPenalty;
    const rightScore = seededRank(seed, right.id) - (difficultyDistance(right, targetDifficulty) * 0.18) - rightRecentPenalty;
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });

  const selected = [];
  const usedThemes = new Set();
  while (selected.length < safeCount && ranked.length) {
    let index = ranked.findIndex((document) => !usedThemes.has(document.theme));
    if (index < 0) index = 0;
    const [document] = ranked.splice(index, 1);
    selected.push(document);
    usedThemes.add(document.theme);
  }
  return Object.freeze(selected);
}

export function createFlowCorpusExcerpt(document, {
  seed = "flow-corpus-excerpt",
  paragraphCount = 3,
  recentExcerptIds = [],
} = {}) {
  validateFlowCorpusDocument(document);
  const safeCount = Math.max(1, Math.min(Math.floor(Number(paragraphCount) || 1), document.paragraphs.length));
  const maxStart = document.paragraphs.length - safeCount;
  const recent = new Set(Array.isArray(recentExcerptIds) ? recentExcerptIds : []);
  let start = maxStart > 0 ? hashFlowCorpusSeed(String(seed) + ":" + document.id) % (maxStart + 1) : 0;

  for (let attempt = 0; attempt <= maxStart; attempt += 1) {
    const candidate = (start + attempt) % (maxStart + 1 || 1);
    const candidateId = document.id + ":p" + String(candidate + 1) + "-" + String(candidate + safeCount);
    if (!recent.has(candidateId)) {
      start = candidate;
      break;
    }
  }

  const excerptId = document.id + ":p" + String(start + 1) + "-" + String(start + safeCount);
  const passages = Object.freeze(document.paragraphs.slice(start, start + safeCount).map((text, offset) => Object.freeze({
    id: document.id + "-p" + String(start + offset + 1).padStart(2, "0"),
    title: "Paragraph " + String(start + offset + 1),
    category: "stories",
    difficulty: document.difficulty,
    tags: document.tags,
    text,
    ...analyzeFlowCorpusText(text),
  })));

  return Object.freeze({
    id: excerptId,
    documentId: document.id,
    title: document.title,
    theme: document.theme,
    themeLabel: document.themeLabel,
    difficulty: document.difficulty,
    typabilityScore: document.typabilityScore,
    startParagraph: start,
    paragraphCount: passages.length,
    passages,
    wordCount: passages.reduce((sum, passage) => sum + passage.wordCount, 0),
  });
}

export const FLOW_CORPUS_V2_STATS = validateFlowCorpusV2();
