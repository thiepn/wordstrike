import { createFlowCatalog } from "./flowContent.js";
import { FLOW_EXPANSION_PASSAGES } from "./flowContentExpansion.js";

export const FLOW_SEED_PASSAGES = Object.freeze([
  { id: "everyday-smooth-01", category: "everyday", difficulty: "smooth", tags: ["common-words", "periods"], text: `I made tea, opened the window, and wrote down three things I wanted to finish before lunch. The list was short, clear, and easy to follow.` },
  { id: "everyday-natural-01", category: "everyday", difficulty: "natural", tags: ["commas", "apostrophes", "conversation"], text: `I wasn't sure whether the shop would still be open, so I sent a quick message before leaving. Ten minutes later, they replied and said they'd wait.` },
  { id: "everyday-advanced-01", category: "everyday", difficulty: "advanced", tags: ["semicolons", "parentheses", "long-sentences"], text: `The plan looked simple at first; buy groceries, return the library books, and pick up the package (before the desk closed). By noon, two small delays had changed the order completely.` },
  { id: "everyday-expert-01", category: "everyday", difficulty: "expert", tags: ["numbers", "symbols", "dashes", "mixed-punctuation"], text: `At 18:45, the train app changed from "on time" to +12 min, then +19 min. I could wait, take bus 143, or walk 2.4 km — none of the options was perfect, but all three were workable.` },

  { id: "stories-smooth-01", category: "stories", difficulty: "smooth", tags: ["narrative", "common-words"], text: `The light in the hallway was still on when Lena came home. She set her keys on the table, heard the rain outside, and smiled at the quiet room.` },
  { id: "stories-natural-01", category: "stories", difficulty: "natural", tags: ["narrative", "commas", "past-tense"], text: `Jonas reached the bridge just as the first drops began to fall. He pulled up his hood, crossed faster, and noticed a small paper boat moving under the railing.` },
  { id: "stories-advanced-01", category: "stories", difficulty: "advanced", tags: ["narrative", "semicolons", "dashes"], text: `The map ended at the old stone wall; beyond it, the path narrowed into wet grass and disappeared beneath the trees. Mira hesitated — then heard the bell again, faint but unmistakable.` },
  { id: "stories-expert-01", category: "stories", difficulty: "expert", tags: ["narrative", "quotes", "numbers", "parentheses"], text: `At 02:17, the radio crackled once. "Station 4, confirm your position," a voice said. Elias checked the marker beside the road (KM 86), looked toward the empty fields, and answered only after the signal returned.` },

  { id: "dialogue-smooth-01", category: "dialogue", difficulty: "smooth", tags: ["quotes", "dialogue"], text: `"Are you ready?" Mia asked. "Almost," Ben said. "Give me one minute, and then we can go."` },
  { id: "dialogue-natural-01", category: "dialogue", difficulty: "natural", tags: ["quotes", "apostrophes", "dialogue"], text: `"I thought you'd already left," Nora said. "I was going to, but the bus didn't come." Amir checked the street again. "Let's walk to the next stop."` },
  { id: "dialogue-advanced-01", category: "dialogue", difficulty: "advanced", tags: ["quotes", "semicolons", "dashes"], text: `"You can send it now," Felix said, "but I'd read the last paragraph once more." Lina shook her head. "If I read it again, I'll change everything — and then we'll still be here at midnight."` },
  { id: "dialogue-expert-01", category: "dialogue", difficulty: "expert", tags: ["quotes", "numbers", "symbols", "parentheses"], text: `"The estimate says 6–8 weeks," Priya said, "but that's before the 15% buffer." Daniel frowned. "So the real window is closer to 7–9 weeks (assuming nothing slips)?" "Exactly."` },

  { id: "professional-smooth-01", category: "professional", difficulty: "smooth", tags: ["work", "email-style", "common-words"], text: `Thanks for sending the notes. I reviewed them this morning and added a few comments. I will send the final version before the meeting tomorrow.` },
  { id: "professional-natural-01", category: "professional", difficulty: "natural", tags: ["work", "email-style", "commas"], text: `I've attached the revised schedule, including the new handoff dates. Please check the items marked for Thursday, and let me know if any owner needs to change.` },
  { id: "professional-advanced-01", category: "professional", difficulty: "advanced", tags: ["work", "semicolons", "parentheses"], text: `The first review is complete; three issues remain open, and two depend on external feedback. We can ship the documentation update separately (if Legal approves the wording) rather than delay the entire release.` },
  { id: "professional-expert-01", category: "professional", difficulty: "expert", tags: ["work", "numbers", "symbols", "mixed-punctuation"], text: `Q3 support volume rose by 18.6%, from 4,820 to 5,716 tickets. Response time still improved — 7.4 h to 5.9 h — while the escalation rate stayed below 3%; the next review is scheduled for 14/10.` },

  { id: "academic-smooth-01", category: "academic", difficulty: "smooth", tags: ["academic", "explanation"], text: `A useful model does not need to copy every detail of the real system. It needs to keep the features that matter for the question being studied.` },
  { id: "academic-natural-01", category: "academic", difficulty: "natural", tags: ["academic", "commas", "long-sentences"], text: `When a sample is small, individual observations can have a large effect on the result. For that reason, researchers usually report uncertainty rather than only a single estimate.` },
  { id: "academic-advanced-01", category: "academic", difficulty: "advanced", tags: ["academic", "semicolons", "parentheses"], text: `Correlation alone does not establish a causal mechanism; two variables may move together because both respond to a third factor. A stronger design (for example, a controlled experiment) can reduce that ambiguity.` },
  { id: "academic-expert-01", category: "academic", difficulty: "expert", tags: ["academic", "numbers", "symbols", "parentheses"], text: `The intervention group improved by 12.7%, compared with 4.1% in the control group (n = 240). However, the 95% confidence interval remained wide; the estimate therefore supports a difference, but not a highly precise one.` },

  { id: "quotes-smooth-01", category: "quotes", difficulty: "smooth", tags: ["quotes", "short-form"], text: `"A small task finished today is more useful than a perfect plan postponed until tomorrow."` },
  { id: "quotes-natural-01", category: "quotes", difficulty: "natural", tags: ["quotes", "apostrophes", "commas"], text: `"You don't need to feel ready before you begin; sometimes beginning is what makes the next step clear."` },
  { id: "quotes-advanced-01", category: "quotes", difficulty: "advanced", tags: ["quotes", "semicolons", "dashes"], text: `"Attention is limited; spend it deliberately — not on everything that asks for it, but on what deserves it."` },
  { id: "quotes-expert-01", category: "quotes", difficulty: "expert", tags: ["quotes", "numbers", "symbols", "mixed-punctuation"], text: `"If 80% of the result comes from the first 20% of the work, identify that part early — then protect enough time to do it carefully."` },

  { id: "numbers-symbols-smooth-01", category: "numbers-symbols", difficulty: "smooth", tags: ["numbers", "dates", "times"], text: `The appointment starts at 9:30 and ends at 10:15. Bring form 2, your ID, and the note dated 16/09.` },
  { id: "numbers-symbols-natural-01", category: "numbers-symbols", difficulty: "natural", tags: ["numbers", "currency", "percentages"], text: `The total was €48.60 after a 10% discount. I paid €50, received €1.40 back, and kept the receipt for the monthly budget.` },
  { id: "numbers-symbols-advanced-01", category: "numbers-symbols", difficulty: "advanced", tags: ["numbers", "symbols", "technical"], text: `Set retries = 3, keep the timeout below 2.5 s, and send alerts when failure rate > 4%. For test accounts, use the tag #staging rather than #prod.` },
  { id: "numbers-symbols-expert-01", category: "numbers-symbols", difficulty: "expert", tags: ["numbers", "symbols", "currency", "technical"], text: `Invoice #A-2048 lists 12 units @ €39.90 each, plus 19% VAT and €14.50 shipping. Verify that subtotal + tax + shipping = final total before marking status = "paid".` },

  { id: "everyday-smooth-02", category: "everyday", difficulty: "smooth", tags: ["common-words", "questions"], text: `Did you remember the blue bag by the door? It has the charger, a water bottle, and the book we need for the train.` },
  { id: "stories-natural-02", category: "stories", difficulty: "natural", tags: ["narrative", "questions", "commas"], text: `A note was tucked beneath the cup when Sam returned. It had no name, only one sentence: "Will you remember where we first met?"` },
  { id: "professional-advanced-02", category: "professional", difficulty: "advanced", tags: ["work", "colons", "semicolons"], text: `The review has one priority: remove uncertainty before launch. Product owns the final copy; Engineering owns the migration; Support will verify the help-center links.` },
  { id: "academic-expert-02", category: "academic", difficulty: "expert", tags: ["academic", "symbols", "numbers", "parentheses"], text: `For x >= 0, the approximation remains within 2% across the tested interval [0, 25]. Outside that range, error grows quickly; extrapolation should therefore be treated as a separate assumption, not a measured result.` },
]);

export const FLOW_PASSAGE_CATALOG = createFlowCatalog([
  ...FLOW_SEED_PASSAGES,
  ...FLOW_EXPANSION_PASSAGES,
]);
