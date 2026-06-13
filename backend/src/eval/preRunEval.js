import { generateActions }  from "../ai/actionGenerator.js";
import { evalSelector }    from "./selectorEval.js";
import { autoFixAction }   from "./actionAutoFix.js";
import { appKnowledge }    from "../knowledge/appKnowledge.js";
import { config }          from "../config/index.js";

export async function runPreRunEval(page, useCase, url, credentials, pageAnalysis, knowledgeBase, onEvent) {
  const threshold = config.eval.confidenceThreshold;

  // Generate actions the same way the runner would
  let actions;
  try {
    actions = await generateActions(useCase, url, credentials, pageAnalysis);
  } catch (e) {
    onEvent({ type: "eval_result", score: 0, prodReady: false, passed: false, fixedCount: 0, blockedCount: 0 });
    return { overallScore: 0, actions: [], passed: false, blockedCount: 0, fixedCount: 0 };
  }

  onEvent({ type: "eval_start", ucId: useCase.id, stepCount: actions.length });

  const evaluated = [];
  let fixedCount   = 0;
  let blockedCount = 0;
  let scoreSum     = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const boost  = appKnowledge.getConfidenceBoost(url, action.selector);

    const evalResult = await evalSelector(page, action, boost).catch(() => ({
      score: 0, matches: 0, visible: false, interactable: false, issue: "eval error",
    }));

    onEvent({ type: "eval_progress", index: i, total: actions.length, selector: action.selector ?? "(none)", score: evalResult.score });

    if (evalResult.score >= threshold) {
      evaluated.push({ ...action, evalScore: evalResult.score, fixed: false, blocked: false });
      scoreSum += evalResult.score;
    } else {
      // Attempt auto-fix
      const fix = await autoFixAction(page, action, evalResult, pageAnalysis, knowledgeBase).catch(() => ({
        fixed: false, action, newScore: evalResult.score, reasoning: "auto-fix threw",
      }));

      if (fix.fixed) {
        fixedCount++;
        scoreSum += fix.newScore;
        evaluated.push({ ...fix.action, evalScore: fix.newScore, fixed: true, fixReason: fix.reasoning, blocked: false });
        onEvent({ type: "eval_fixed", index: i, oldSelector: action.selector, newSelector: fix.action.selector, newScore: fix.newScore, reasoning: fix.reasoning });
      } else {
        blockedCount++;
        scoreSum += 0;
        evaluated.push({ ...action, evalScore: evalResult.score, fixed: false, blocked: true, fixReason: fix.reasoning || evalResult.issue });
        onEvent({ type: "eval_blocked", index: i, selector: action.selector ?? "(none)", score: evalResult.score, issue: evalResult.issue ?? "could not fix" });
      }
    }
  }

  const overallScore = actions.length > 0 ? Math.round(scoreSum / actions.length) : 100;
  const prodReady    = overallScore >= config.eval.prodReadyThreshold;

  onEvent({ type: "eval_result", score: overallScore, prodReady, passed: blockedCount === 0, fixedCount, blockedCount });

  return { overallScore, actions: evaluated, passed: blockedCount === 0, blockedCount, fixedCount };
}
