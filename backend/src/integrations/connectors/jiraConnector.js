/**
 * Jira connector
 * Fetches tickets, sprints, acceptance criteria for test context.
 */
export async function jiraConnector(config) {
  const { baseUrl, email, apiToken, projectKeys = "", maxIssues = 30 } = config;
  if (!baseUrl || !email || !apiToken) throw new Error("Missing baseUrl, email, or apiToken");

  const auth    = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const base    = baseUrl.replace(/\/$/, "");

  // Test connection
  const meRes = await fetch(`${base}/rest/api/3/myself`, { headers });
  if (!meRes.ok) throw new Error(`Auth failed: ${meRes.status}`);
  const me = await meRes.json();

  const projects = projectKeys ? projectKeys.split(",").map(p => p.trim()) : [];
  const jql      = projects.length
    ? `project in (${projects.join(",")}) AND sprint in openSprints() ORDER BY priority DESC`
    : `sprint in openSprints() ORDER BY priority DESC`;

  const issueRes = await fetch(
    `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxIssues}&fields=summary,description,status,priority,labels,acceptance_criteria,issuetype,assignee`,
    { headers }
  );

  const issues = [];
  if (issueRes.ok) {
    const data = await issueRes.json();
    for (const issue of (data.issues || [])) {
      const desc = extractText(issue.fields.description);
      issues.push({
        key:         issue.key,
        type:        issue.fields.issuetype?.name || "Task",
        summary:     issue.fields.summary,
        status:      issue.fields.status?.name || "",
        priority:    issue.fields.priority?.name || "",
        labels:      issue.fields.labels || [],
        description: desc.slice(0, 300),
        url:         `${base}/browse/${issue.key}`,
      });
    }
  }

  // Get current sprint info
  let sprintInfo = null;
  if (projects.length) {
    const boardRes = await fetch(`${base}/rest/agile/1.0/board?projectKeyOrId=${projects[0]}`, { headers });
    if (boardRes.ok) {
      const boards = await boardRes.json();
      const board  = boards.values?.[0];
      if (board) {
        const sprintRes = await fetch(`${base}/rest/agile/1.0/board/${board.id}/sprint?state=active`, { headers });
        if (sprintRes.ok) {
          const sprints  = await sprintRes.json();
          const sprint   = sprints.values?.[0];
          if (sprint) sprintInfo = { name: sprint.name, goal: sprint.goal, endDate: sprint.endDate };
        }
      }
    }
  }

  return {
    user:       { displayName: me.displayName },
    issues,
    sprintInfo,
    summary:    `${issues.length} Jira issues fetched${sprintInfo ? ` (sprint: ${sprintInfo.name})` : ""}`,
  };
}

export function jiraToContext(data) {
  if (!data?.issues?.length) return "";
  const lines = [`Jira Issues (${data.issues.length} in current sprint):`];
  if (data.sprintInfo) {
    lines.push(`Sprint: ${data.sprintInfo.name}${data.sprintInfo.goal ? ` — Goal: ${data.sprintInfo.goal}` : ""}`);
  }
  for (const issue of data.issues.slice(0, 15)) {
    lines.push(`- [${issue.key}] ${issue.summary} (${issue.status}, ${issue.priority})${issue.description ? `: ${issue.description.slice(0, 100)}` : ""}`);
  }
  return lines.join("\n");
}

// Extract plain text from Atlassian Document Format
function extractText(adf) {
  if (!adf) return "";
  if (typeof adf === "string") return adf;
  const texts = [];
  function walk(node) {
    if (node?.type === "text") texts.push(node.text || "");
    if (node?.content) node.content.forEach(walk);
  }
  walk(adf);
  return texts.join(" ").replace(/\s+/g, " ").trim();
}
