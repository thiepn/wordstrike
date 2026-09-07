import { buildPracticeLabViewModel as buildPracticeLabViewModelV20 } from "./practiceLabViewModel.js";
import { buildPracticeWeakKeysDetailViewModel } from "./practiceWeakKeysUi.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

export function buildPracticeLabViewModelV21(args = {}) {
  const base = buildPracticeLabViewModelV20(args);
  const route = args.route;
  if (route?.name !== PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL || route?.params?.experimentId !== "weak-keys") return base;
  const resolved = args.registry?.getResolvedExperiment?.("weak-keys") ?? null;
  if (!resolved) return base;
  return Object.freeze({
    ...base,
    ...buildPracticeWeakKeysDetailViewModel({
      entry: resolved.catalogEntry,
      resolved,
      state: args.weakKeysState,
    }),
    backLabel: "Back to Practice Lab",
  });
}
