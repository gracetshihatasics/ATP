/**
 * CI export formats:
 *   - JUnit XML  (GitHub Actions, Jenkins, Azure DevOps, CircleCI)
 *   - Allure JSON (Allure Report)
 *   - Simple JSON summary
 */

/**
 * Generate JUnit XML from an array of run records.
 * @param {object[]} runs
 * @param {string} suiteName
 * @returns {string} XML string
 */
export function toJUnitXML(runs, suiteName = "ATP Test Suite") {
  const total    = runs.length;
  const failures = runs.filter(r => r.status !== "pass").length;
  const duration = runs.reduce((s, r) => s + (r.duration || 0), 0) / 1000;

  const testCases = runs.map(run => {
    const time = ((run.duration || 0) / 1000).toFixed(3);
    const name = escapeXML(run.name);
    const cls  = escapeXML(run.url || "ATP");

    if (run.status === "pass") {
      return `    <testcase name="${name}" classname="${cls}" time="${time}"/>`;
    }

    const failedSteps = (run.steps || [])
      .filter(s => s.status !== "pass")
      .map(s => `Step: ${s.description || s.name} — ${s.error || "assertion failed"}`)
      .join("\n");

    const failedAssertions = (run.assertions || [])
      .filter(a => !a.passed)
      .map(a => `Assert: ${a.assertion}`)
      .join("\n");

    const message = escapeXML([failedSteps, failedAssertions].filter(Boolean).join("\n") || "Test failed");

    return `    <testcase name="${name}" classname="${cls}" time="${time}">
      <failure message="${message}" type="AssertionError">${message}</failure>
    </testcase>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${escapeXML(suiteName)}" tests="${total}" failures="${failures}" time="${duration.toFixed(3)}">
  <testsuite name="${escapeXML(suiteName)}" tests="${total}" failures="${failures}" time="${duration.toFixed(3)}" timestamp="${new Date().toISOString()}">
${testCases}
  </testsuite>
</testsuites>`;
}

/**
 * Generate Allure-compatible JSON results array.
 * @param {object[]} runs
 * @returns {object[]}
 */
export function toAllureJSON(runs) {
  return runs.map(run => ({
    uuid:        run.id,
    name:        run.name,
    status:      run.status === "pass" ? "passed" : "failed",
    start:       new Date(run.startedAt).getTime(),
    stop:        new Date(run.completedAt).getTime(),
    duration:    run.duration,
    labels: [
      { name: "suite",    value: run.url || "ATP" },
      { name: "feature",  value: run.type || "test" },
      { name: "severity", value: "normal" },
    ],
    steps: (run.steps || []).map(s => ({
      name:   s.description || s.name,
      status: s.status === "pass" ? "passed" : "failed",
      stop:   s.duration || 0,
    })),
    attachments: [],
    parameters:  [],
  }));
}

/**
 * Generate a simple JSON summary suitable for Slack/webhook notifications.
 * @param {object[]} runs
 * @param {string} suiteName
 * @returns {object}
 */
export function toJSONSummary(runs, suiteName = "ATP Run") {
  const passed   = runs.filter(r => r.status === "pass").length;
  const failed   = runs.filter(r => r.status !== "pass").length;
  const duration = runs.reduce((s, r) => s + (r.duration || 0), 0);

  return {
    suite:       suiteName,
    timestamp:   new Date().toISOString(),
    total:       runs.length,
    passed,
    failed,
    passRate:    runs.length > 0 ? Math.round(passed / runs.length * 100) : 0,
    duration:    `${(duration / 1000).toFixed(1)}s`,
    status:      failed === 0 ? "PASS" : "FAIL",
    results:     runs.map(r => ({
      name:     r.name,
      status:   r.status,
      duration: r.duration,
      url:      r.url,
    })),
  };
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}
