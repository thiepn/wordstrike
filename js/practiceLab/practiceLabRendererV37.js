import { renderPracticeLabV36 } from "./practiceLabRendererV36.js";
import { renderPracticeWeaknessBossDetail } from "./practiceWeaknessBossUi.js";

export function renderPracticeLabV37(root, view, options = {}) {
  if (view?.kind === "weakness-boss-detail") return renderPracticeWeaknessBossDetail(root, view, options);
  return renderPracticeLabV36(root, view, options);
}
