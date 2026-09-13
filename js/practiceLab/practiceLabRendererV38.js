import { renderPracticeLabV37 } from "./practiceLabRendererV37.js";
import { renderPracticeResearchPage } from "./practiceResearchUi.js";

export function renderPracticeLabV38(root, view, options = {}) {
  if (view?.kind === "research") return renderPracticeResearchPage(root, view, options);
  return renderPracticeLabV37(root, view, options);
}
