import { runUseCase } from "./useCaseRunner.js";
import { send }       from "../ws/send.js";

const DELAY_BETWEEN_CASES_MS = 1000;

/**
 * Run an ordered list of use cases sequentially, streaming a suite_start
 * event first and a suite_complete event at the end.
 *
 * @param {import('ws').WebSocket} ws
 * @param {string} sessionId
 * @param {{ useCases: object[], url: string, credentials: object }} payload
 */
export async function runSuite(ws, sessionId, { useCases, url, credentials }) {
  send(ws, { type: "suite_start", total: useCases.length });

  const ran = [];
  for (const useCase of useCases) {
    await runUseCase(ws, sessionId, { useCase, url, credentials });
    ran.push(useCase.id);
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_CASES_MS));
  }

  send(ws, { type: "suite_complete", ran });
}
