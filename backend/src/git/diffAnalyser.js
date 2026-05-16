import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Analyse a PR diff and determine:
 * 1. What features/flows are affected by the changes
 * 2. Which existing test cases should be re-run
 * 3. Whether new test cases should be created
 * 4. Risk level of the changes
 */
export async function analyseDiff(prEvent, changedFiles, existingUseCases = []) {
  const filesSummary = changedFiles.map(f =>
    `${f.status.toUpperCase()}: ${f.filename} (+${f.additions}/-${f.deletions})\n${f.patch ? `Patch:\n${f.patch}\n` : ""}`
  ).join("\n---\n");

  const useCasesSummary = existingUseCases.slice(0, 50).map(uc =>
    `- [${uc.id}] ${uc.title} (${uc.category}, ${uc.priority})`
  ).join("\n");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are a senior QA engineer reviewing a pull request diff to determine testing impact.

PR: #${prEvent.prNumber} — "${prEvent.prTitle}"
Branch: ${prEvent.branchFrom} → ${prEvent.branchTo}
Author: ${prEvent.author}

Changed Files (${changedFiles.length}):
${filesSummary}

Existing Test Cases:
${useCasesSummary || "No existing test cases found."}

Analyse the diff and determine:
1. What features or user flows are affected by these changes?
2. Which existing test cases should be re-run?
3. Do any new test cases need to be created?
4. What is the risk level of these changes?
5. Are there any specific concerns or edge cases to watch for?

CRITICAL: Raw JSON only. Start { end }.
{
  "riskLevel": "critical|high|medium|low",
  "riskReason": "string — why this risk level",
  "summary": "string — 2 sentences: what changed and testing impact",
  "affectedFeatures": [
    {
      "feature": "string — feature/area name",
      "confidence": "high|medium|low",
      "reason": "string — why this feature is affected",
      "files": ["filename1"]
    }
  ],
  "affectedTestIds": ["UC-001", "UC-002"],
  "newTestsNeeded": [
    {
      "title": "string",
      "reason": "string — what new behaviour needs testing",
      "priority": "Critical|High|Medium|Low",
      "category": "Core Workflow|Edge Case|Security|Performance",
      "steps": ["step 1", "step 2"]
    }
  ],
  "testStrategy": "string — overall testing approach recommendation",
  "skipSafe": ["UC-003"],
  "concerns": ["string — specific edge cases or risks to watch"],
  "estimatedTestTime": "string — e.g. '3-5 minutes'"
}`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSON(raw);
}

/**
 * Update existing use cases based on diff analysis.
 * Returns updated use cases with new steps/assertions where relevant.
 */
export async function updateTestsFromDiff(affectedUseCases, changedFiles, diffAnalysis) {
  if (!affectedUseCases.length) return [];

  const updated = [];

  for (const uc of affectedUseCases) {
    const relevantFiles = changedFiles.filter(f =>
      diffAnalysis.affectedFeatures?.some(af =>
        af.confidence !== "low" && af.files?.some(fn => fn.includes(f.filename.split("/").pop()))
      )
    );

    if (!relevantFiles.length) {
      updated.push({ ...uc, updateStatus: "unchanged" });
      continue;
    }

    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `A test case needs to be reviewed after a code change.

Test Case: ${uc.title}
Current steps:
${uc.steps?.map((s, i) => `${i + 1}. ${s}`).join("\n") || "No steps"}

Relevant code changes:
${relevantFiles.map(f => `${f.filename} (${f.status})\n${f.patch?.slice(0, 500) || ""}`).join("\n\n")}

Diff analysis summary: ${diffAnalysis.summary}
Risk: ${diffAnalysis.riskLevel}

Does this test case need to be updated? If yes, provide updated steps and assertions.
If the test is now broken by the change, flag it.

Raw JSON only: {
  "needsUpdate": true/false,
  "updateType": "steps|assertions|both|none|broken",
  "reason": "string",
  "updatedSteps": ["step 1"],
  "updatedAssertions": ["assertion 1"],
  "isBroken": false,
  "brokenReason": "string if broken"
}`,
      }],
    });

    const raw    = response.content[0]?.text ?? "";
    const update = extractJSON(raw);

    updated.push({
      ...uc,
      updateStatus: update.needsUpdate ? "updated" : "reviewed",
      isBroken:     update.isBroken || false,
      brokenReason: update.brokenReason,
      ...(update.needsUpdate && {
        steps:      update.updatedSteps?.length      ? update.updatedSteps      : uc.steps,
        assertions: update.updatedAssertions?.length ? update.updatedAssertions : uc.assertions,
      }),
    });
  }

  return updated;
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return {};
}
