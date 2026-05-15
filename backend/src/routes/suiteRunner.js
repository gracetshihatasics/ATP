import crypto          from "crypto";
import { runUseCase }  from "./useCaseRunner.js";
import { send }        from "../ws/send.js";
import { resultsStore } from "../results/store.js";

const DELAY_BETWEEN_CASES_MS = 1000;

export async function runSuite(ws, sessionId, { useCases, url, credentials }) {
  const suiteId   = `suite-${crypto.randomUUID().slice(0, 8)}`;
  const startTime = Date.now();

  send(ws, { type: "suite_start", total: useCases.length, suiteId });

  const ucResults = [];
  for (const useCase of useCases) {
    const result = await runUseCase(ws, sessionId, { useCase, url, credentials, suiteId });
    if (result) ucResults.push(result);
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_CASES_MS));
  }

  const passed   = ucResults.filter(r => r.status === "pass").length;
  const failed   = ucResults.filter(r => r.status !== "pass").length;
  const duration = Date.now() - startTime;

  // Save suite-level result
  const saved = resultsStore.save({
    type:        "suite",
    name:        `Suite (${useCases.length} tests)`,
    url,
    status:      failed === 0 ? "pass" : "fail",
    passed,
    failed,
    total:       ucResults.length,
    duration,
    steps:       ucResults.map(r => ({
      description: r.name,
      status:      r.status,
      duration:    r.duration,
      runId:       r.id,
    })),
    assertions:  [],
    suiteId,
    ucRunIds:    ucResults.map(r => r.id),
    startedAt:   new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
  });

  send(ws, { type: "suite_complete", ran: ucResults.map(r => r.id), suiteId, passed, failed, runId: saved.id });
}
