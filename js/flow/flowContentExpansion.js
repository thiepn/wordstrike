function passage(id, tags, text) {
  return Object.freeze({ id, tags: Object.freeze(tags), text });
}

function group(category, difficulty, entries) {
  return entries.map(([id, tags, text]) => Object.freeze({
    ...passage(id, tags, text),
    category,
    difficulty,
  }));
}

export const FLOW_EXPANSION_PASSAGES = Object.freeze([
  ...group("everyday", "smooth", [
    ["everyday-smooth-03", ["common-words", "periods"], `After breakfast, I cleared the table, filled my bottle, and put the keys beside my bag. Everything I needed was in one place before I left.`],
    ["everyday-smooth-04", ["common-words", "questions"], `Do we need anything from the market tonight? I wrote milk, rice, apples, and soap on the list so we would not forget them again.`],
  ]),
  ...group("everyday", "natural", [
    ["everyday-natural-02", ["commas", "apostrophes", "conversation"], `I couldn't find the receipt in my wallet, so I checked the kitchen counter, the desk, and the jacket I'd worn yesterday. It was folded inside the shopping list.`],
    ["everyday-natural-03", ["commas", "questions", "periods"], `The weather looked calm when I stepped outside, but the clouds were moving fast. Should I carry an umbrella, or trust the ten-minute walk to stay dry?`],
    ["everyday-natural-04", ["commas", "apostrophes", "periods"], `We'd planned to cook at home, but neither of us wanted the meal we'd chosen. We opened the fridge, changed the plan, and made something simpler instead.`],
  ]),
  ...group("everyday", "advanced", [
    ["everyday-advanced-02", ["semicolons", "colons", "long-sentences"], `The morning had one clear rule: finish the difficult errand first. I almost ignored it; instead, I left before breakfast, solved the problem, and came home with the rest of the day still open.`],
    ["everyday-advanced-03", ["parentheses", "commas", "dashes"], `I moved the appointment to Friday (the only free afternoon), updated the calendar, and sent a reminder to myself — because last month I remembered the time but forgot the address.`],
    ["everyday-advanced-04", ["semicolons", "questions", "long-sentences"], `The room was finally quiet; the laundry was running, dinner was in the oven, and every urgent message had been answered. What should I do with an hour that nobody else had claimed?`],
  ]),
  ...group("everyday", "expert", [
    ["everyday-expert-02", ["numbers", "currency", "percentages", "mixed-punctuation"], `The grocery total reached €63.84, which was 14% above my plan. I removed two extras, used a €5 coupon, and brought the final amount down to €51.20 — close enough for this week.`],
    ["everyday-expert-03", ["numbers", "times", "parentheses", "dashes"], `My morning schedule had three fixed points: coffee at 07:10, a call at 08:30, and the train at 09:06. Everything else (breakfast, packing, and a short walk) had to fit between them — without rushing.`],
    ["everyday-expert-04", ["numbers", "symbols", "quotes", "mixed-punctuation"], `The phone showed "Battery: 9%" just as the map said 3.8 km remained. I switched on power saving, lowered the screen, and followed the last two turns before the signal dropped to one bar.`],
  ]),

  ...group("stories", "smooth", [
    ["stories-smooth-02", ["narrative", "common-words"], `Noah found a red scarf on the park bench after everyone had gone. He waited near the gate for a while, then carried it to the small office by the path.`],
    ["stories-smooth-03", ["narrative", "periods"], `The bakery lights came on before sunrise. Mara watched from the bus stop as the first trays reached the window and warm air fogged the glass.`],
    ["stories-smooth-04", ["narrative", "questions"], `A soft knock came from the back door. Leo looked at the clock, then at the empty hall. Who would visit this early on a Sunday morning?`],
  ]),
  ...group("stories", "natural", [
    ["stories-natural-03", ["narrative", "commas", "past-tense"], `When the elevator stopped between floors, Ava expected the lights to fail too. Instead, music kept playing softly, the fan kept turning, and someone outside called her name.`],
    ["stories-natural-04", ["narrative", "questions", "quotes"], `Ruben opened the envelope and found a train ticket with tomorrow's date. On the back, someone had written, "Do you still want to see the sea?"`],
  ]),
  ...group("stories", "advanced", [
    ["stories-advanced-02", ["narrative", "semicolons", "dashes"], `The trail should have ended at the river; instead, it continued beneath a fallen fence and climbed toward an abandoned orchard. Kai checked the map twice — the path was not supposed to exist.`],
    ["stories-advanced-03", ["narrative", "quotes", "commas"], `"Don't turn on the porch light," the note said, though nothing outside looked unusual. Elena stood behind the curtain, listening to the wind move through the trees, and waited for the second instruction.`],
    ["stories-advanced-04", ["narrative", "parentheses", "long-sentences"], `By the time the ferry reached the island (nearly an hour late), the last bus had gone and the harbor cafe was closing. Tomas lifted his suitcase, chose the road toward town, and started walking.`],
  ]),
  ...group("stories", "expert", [
    ["stories-expert-02", ["narrative", "numbers", "quotes", "mixed-punctuation"], `At 23:58, the station board changed from TRACK 6 to TRACK 11. "That's impossible," Mei said; the tunnel doors were already closing, and the final train was due in 4 min.`],
    ["stories-expert-03", ["narrative", "numbers", "parentheses", "dashes"], `The lighthouse log ended with one entry: 04/11, 03:26, visibility < 200 m. Arlo read it again (the ink was still dark), then heard three slow knocks from the locked room above — exactly ten seconds apart.`],
    ["stories-expert-04", ["narrative", "symbols", "quotes", "parentheses"], `A card marked "B-17" was taped beneath the desk, beside a tiny diagram: square + circle = door. Nia laughed at first; then the wall panel (which had no handle) clicked open by itself.`],
  ]),

  ...group("dialogue", "smooth", [
    ["dialogue-smooth-02", ["quotes", "dialogue", "questions"], `"Did you bring the tickets?" Ana asked. "Yes, they're in my pocket." "Good. Then we only need to find the right platform."`],
    ["dialogue-smooth-03", ["quotes", "dialogue", "common-words"], `"The soup is ready," Omar said. "I'll set the table." June smiled. "Leave one bowl for Mia. She said she might be late."`],
    ["dialogue-smooth-04", ["quotes", "dialogue", "questions"], `"Which road should we take?" Eli asked. "The quiet one by the lake," Sara said. "It is longer, but the view is better."`],
  ]),
  ...group("dialogue", "natural", [
    ["dialogue-natural-02", ["quotes", "apostrophes", "dialogue", "commas"], `"I don't think the file uploaded," Lena said. "It did, but it's under yesterday's folder." Max pointed at the screen. "There — second row, on the left."`],
    ["dialogue-natural-03", ["quotes", "apostrophes", "questions"], `"You haven't eaten yet?" David asked. "I was waiting for you." "Then let's stop here before we keep walking; I don't want another hour on an empty stomach."`],
    ["dialogue-natural-04", ["quotes", "dialogue", "commas"], `"We can leave now, or wait until the rain slows," Priya said. Sam looked at the dark clouds. "If we wait, we'll miss the opening. Grab the umbrellas."`],
  ]),
  ...group("dialogue", "advanced", [
    ["dialogue-advanced-02", ["quotes", "semicolons", "dashes"], `"The draft is good," Marcus said, "but the opening promises too much." Imani nodded; she'd noticed the same thing. "Then we cut that line — not soften it, cut it."`],
    ["dialogue-advanced-03", ["quotes", "colons", "dialogue"], `"There are two options," Hana said: "delay the launch, or reduce the first release." Theo leaned back. "Which one protects quality without creating another month of work?"`],
    ["dialogue-advanced-04", ["quotes", "parentheses", "long-sentences"], `"I can approve the change today," Felix said, "provided the test report includes the failed cases (not only the final pass)." Mira closed her notebook. "That's fair; I'll add them before lunch."`],
  ]),
  ...group("dialogue", "expert", [
    ["dialogue-expert-02", ["quotes", "numbers", "percentages", "mixed-punctuation"], `"We're at 92.4% completion," Niko said, "but the last 7.6% includes every blocked task." Aya frowned. "So 'almost done' really means three owners, two vendors, and zero spare days?"`],
    ["dialogue-expert-03", ["quotes", "numbers", "currency", "parentheses"], `"The cap is €12,500," Leila said, "including the €1,900 reserve." Ben checked the sheet. "Then option C is out (unless the supplier drops below €10,600), correct?" "Correct."`],
    ["dialogue-expert-04", ["quotes", "numbers", "symbols", "dashes"], `"Use build #1842, not #1841," Ren said. "The older package still logs debug data." Kim paused. "And the checksum?" "SHA field ends in 7A9 — if it doesn't, stop."`],
  ]),

  ...group("professional", "smooth", [
    ["professional-smooth-02", ["work", "email-style", "common-words"], `The meeting notes are ready. I added the decisions, owners, and next steps in one page. Please review your item before the team call tomorrow.`],
    ["professional-smooth-03", ["work", "email-style", "periods"], `I finished the first draft and shared it with the project group. The main sections are complete, but the final examples still need review.`],
    ["professional-smooth-04", ["work", "questions", "common-words"], `Can you confirm the room for Friday's workshop? The calendar still shows the old location, and two guests asked where they should go.`],
  ]),
  ...group("professional", "natural", [
    ["professional-natural-02", ["work", "email-style", "commas"], `The client approved the revised outline, so we can move into production on Monday. Please keep the current milestones, and flag any dependency that could affect the first review.`],
    ["professional-natural-03", ["work", "apostrophes", "commas"], `We've closed the design questions, but Engineering still needs the final asset names. I'll send the list this afternoon, and you can confirm whether anything conflicts with the build.`],
    ["professional-natural-04", ["work", "questions", "email-style"], `Could we move the check-in to Wednesday morning? Tuesday's agenda is already full, and the extra day would give everyone time to review the updated numbers.`],
  ]),
  ...group("professional", "advanced", [
    ["professional-advanced-03", ["work", "semicolons", "colons"], `The rollout has two remaining risks: incomplete training and delayed account access. Operations owns the first; IT owns the second; both teams will report status before Thursday's go/no-go review.`],
    ["professional-advanced-04", ["work", "parentheses", "long-sentences"], `We can shorten the approval path by combining the content and compliance reviews (provided neither team requests a separate pass). That change removes one handoff without reducing the final quality check.`],
  ]),
  ...group("professional", "expert", [
    ["professional-expert-02", ["work", "numbers", "percentages", "mixed-punctuation"], `August conversion reached 6.8%, up from 5.9% in July, while refund volume fell from 214 to 187 cases. The next target is < 180 refunds without pushing response time above 6 h.`],
    ["professional-expert-03", ["work", "numbers", "currency", "parentheses"], `The revised budget is €284,000: €176,500 for delivery, €72,000 for operations, and €35,500 held as contingency (12.5% of planned spend). Finance will review variance on 30/09.`],
    ["professional-expert-04", ["work", "numbers", "symbols", "technical"], `Release 4.2.1 is approved for 22:00 UTC, provided error rate stays < 1.5% and queue depth remains below 800. If either threshold fails for 10 min, status = HOLD and rollback begins.`],
  ]),

  ...group("academic", "smooth", [
    ["academic-smooth-02", ["academic", "explanation", "common-words"], `A graph can make a pattern easier to see, but the picture does not replace the data. Labels, units, and the chosen scale all affect how the result is understood.`],
    ["academic-smooth-03", ["academic", "explanation", "periods"], `A definition sets the meaning of a term before it is used in an argument. Clear definitions help readers separate the main claim from nearby ideas.`],
    ["academic-smooth-04", ["academic", "questions", "explanation"], `Why does a result change when one assumption changes? Comparing the two cases can show which part of the model is responsible for the difference.`],
  ]),
  ...group("academic", "natural", [
    ["academic-natural-02", ["academic", "commas", "long-sentences"], `Because measurements contain noise, repeating an observation can reveal whether a pattern is stable. A single unusual value matters less when the broader sample points in the same direction.`],
    ["academic-natural-03", ["academic", "commas", "questions"], `A theory can fit existing evidence well, yet still make poor predictions in a new setting. The important question is whether the same assumptions remain reasonable outside the original sample.`],
    ["academic-natural-04", ["academic", "apostrophes", "long-sentences"], `A model's simplicity is useful only when it keeps the structure needed for the problem. Removing irrelevant detail can improve clarity, but removing a key mechanism can change the conclusion.`],
  ]),
  ...group("academic", "advanced", [
    ["academic-advanced-02", ["academic", "semicolons", "long-sentences"], `Statistical significance and practical importance answer different questions; a very small effect can be estimated precisely, while a larger effect may remain uncertain when the sample is limited.`],
    ["academic-advanced-03", ["academic", "parentheses", "colons"], `A useful comparison requires a common basis: the same outcome, time horizon, and population. Without that alignment (or a justified adjustment), numerical differences can reflect design choices rather than real effects.`],
    ["academic-advanced-04", ["academic", "semicolons", "questions"], `Evidence can weaken an explanation without identifying a complete alternative; rejecting one mechanism does not automatically prove another. Which additional observation would distinguish the remaining possibilities?`],
  ]),
  ...group("academic", "expert", [
    ["academic-expert-03", ["academic", "numbers", "percentages", "parentheses"], `Among 1,240 observations, the estimated effect was 3.6 percentage points (95% interval: 1.1 to 6.2). The direction is consistent with the hypothesis, but uncertainty still spans effects of meaningfully different sizes.`],
    ["academic-expert-04", ["academic", "numbers", "symbols", "long-sentences"], `For n = 480, model A reduced mean error from 0.184 to 0.151, a relative drop of 17.9%; however, performance changed little once lambda > 0.8, suggesting that additional regularization offered limited benefit in this range.`],
  ]),

  ...group("quotes", "smooth", [
    ["quotes-smooth-02", ["quotes", "short-form", "common-words"], `"A clear next step is often more useful than a long list of possible directions."`],
    ["quotes-smooth-03", ["quotes", "short-form", "periods"], `"Good routines make small choices easier, leaving more attention for the choices that truly need it."`],
    ["quotes-smooth-04", ["quotes", "short-form", "questions"], `"When a plan feels too large, ask what useful part can be finished before the day ends."`],
  ]),
  ...group("quotes", "natural", [
    ["quotes-natural-02", ["quotes", "apostrophes", "commas"], `"You won't control every interruption, but you can decide how quickly you return to the work that matters."`],
    ["quotes-natural-03", ["quotes", "commas", "short-form"], `"Progress becomes easier to notice when the goal is specific, the next action is visible, and the standard is clear."`],
    ["quotes-natural-04", ["quotes", "apostrophes", "questions"], `"If today's effort feels small, remember that consistency is built from ordinary days rather than rare perfect ones."`],
  ]),
  ...group("quotes", "advanced", [
    ["quotes-advanced-02", ["quotes", "semicolons", "dashes"], `"Urgency can create motion without direction; choose the destination first — then decide which speed actually serves it."`],
    ["quotes-advanced-03", ["quotes", "colons", "long-sentences"], `"A useful review asks two questions: what produced the result, and what should change before the same situation appears again?"`],
    ["quotes-advanced-04", ["quotes", "semicolons", "commas"], `"Clarity rarely removes every difficulty; it simply tells you which difficulty belongs to the work, and which one came from confusion."`],
  ]),
  ...group("quotes", "expert", [
    ["quotes-expert-02", ["quotes", "numbers", "percentages", "mixed-punctuation"], `"If a process succeeds 97% of the time, study the remaining 3% carefully — rare failures can reveal assumptions that average performance hides."`],
    ["quotes-expert-03", ["quotes", "numbers", "symbols", "parentheses"], `"A 2x improvement sounds impressive; ask what changed in the baseline, the measurement window, and the excluded cases (if any) before trusting the headline."`],
    ["quotes-expert-04", ["quotes", "numbers", "currency", "dashes"], `"Saving €10 once is useful; designing a habit that saves €10 every week is different — one changes a day, the other changes the pattern."`],
  ]),

  ...group("numbers-symbols", "smooth", [
    ["numbers-symbols-smooth-02", ["numbers", "dates", "times"], `The class begins at 14:00 on 21/09. Room 3 opens at 13:45, and the first break is planned for 15:20.`],
    ["numbers-symbols-smooth-03", ["numbers", "times", "periods"], `Bus 18 leaves at 08:12, 08:27, and 08:42. The trip takes about 25 min, so the middle option should arrive before 09:00.`],
    ["numbers-symbols-smooth-04", ["numbers", "dates", "questions"], `Order 514 was placed on 12/09 and shipped on 14/09. If delivery takes 3 days, should it arrive by 17/09?`],
  ]),
  ...group("numbers-symbols", "natural", [
    ["numbers-symbols-natural-02", ["numbers", "currency", "percentages"], `A €72 jacket was reduced by 25%, bringing the price to €54. I used a €10 voucher, paid €44, and saved the receipt.`],
    ["numbers-symbols-natural-03", ["numbers", "percentages", "commas"], `The battery was at 82% at 08:00, 61% at noon, and 34% at 17:30. Most of the drop happened during two hours of navigation.`],
    ["numbers-symbols-natural-04", ["numbers", "currency", "dates"], `Rent is due on 01/10: €840 for the apartment, €45 for internet, and €28 for the shared utility account. The transfer is scheduled for 30/09.`],
  ]),
  ...group("numbers-symbols", "advanced", [
    ["numbers-symbols-advanced-02", ["numbers", "symbols", "technical"], `Set cache_ttl = 900, retry_limit = 4, and warn when latency > 350 ms. If errors exceed 2%, route traffic to node_b until the primary check passes.`],
    ["numbers-symbols-advanced-03", ["numbers", "symbols", "percentages"], `Sample A contains 480 rows and 7 fields; Sample B contains 525 rows and 7 fields. After cleaning, missing values fell from 6.2% to 1.4% across the merged set.`],
    ["numbers-symbols-advanced-04", ["numbers", "symbols", "technical", "mixed-punctuation"], `For batch #73, set mode = "safe", workers = 6, and max_wait < 45 s. Send #ops an alert if processed < 95% after 12 min.`],
  ]),
  ...group("numbers-symbols", "expert", [
    ["numbers-symbols-expert-02", ["numbers", "symbols", "currency", "percentages"], `Budget #FY27-04 allocates €186,400: 58% delivery, 24% support, 12% tooling, and 6% reserve. If forecast variance > 8%, status = REVIEW before any new purchase.`],
    ["numbers-symbols-expert-03", ["numbers", "symbols", "technical", "parentheses"], `Run build #9021 with threads = 8, timeout = 2.75 s, and memory_cap = 1536 MB. Accept only if p95 < 420 ms and error_rate <= 0.8% (n >= 10,000).`],
    ["numbers-symbols-expert-04", ["numbers", "symbols", "currency", "mixed-punctuation"], `Invoice #C-771 totals €9,842.35: subtotal €7,960.00 + 19% VAT + €370.95 service fee. Verify paid = true, balance = €0.00, and reference = "C-771/26" before closing.`],
  ]),
]);
