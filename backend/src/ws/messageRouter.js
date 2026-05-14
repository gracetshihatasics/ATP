import { runUseCase } from "../routes/useCaseRunner.js";
import { runSuite }   from "../routes/suiteRunner.js";
import { sessionManager } from "./sessionManager.js";
import { send } from "./send.js";

export async function messageRouter(ws, sessionId, msg) {
  switch (msg.type) {
    case "run_usecase":
      return runUseCase(ws, sessionId, msg);

    case "run_suite":
      return runSuite(ws, sessionId, msg);

    case "stop":
      sessionManager.stop(sessionId);
      await sessionManager.destroy(sessionId);
      send(ws, { type: "stopped" });
      break;

    case "screenshot": {
      const session = sessionManager.get(sessionId);
      if (session?.page) {
        const { captureScreenshot } = await import("../browser/screenshot.js");
        const data = await captureScreenshot(session.page);
        send(ws, { type: "screenshot", data, step: "Manual capture" });
      }
      break;
    }

    default:
      send(ws, { type: "log", level: "warn", msg: `Unknown message type: ${msg.type}` });
  }
}
