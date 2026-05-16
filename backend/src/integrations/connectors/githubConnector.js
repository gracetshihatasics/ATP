/**
 * GitHub connector
 * Fetches repo context: README, open issues, recent PRs, file tree
 * Gives ATP awareness of what's being built and recent changes.
 */
export async function githubConnector(config) {
  const { token, repos = "", includeReadme = "true", includeIssues = "true", includePRs = "true" } = config;
  if (!token) throw new Error("Missing GitHub token");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept:        "application/vnd.github.v3+json",
    "User-Agent":  "ATP-Bot",
  };

  // Verify token
  const meRes = await fetch("https://api.github.com/user", { headers });
  if (!meRes.ok) throw new Error(`GitHub auth failed: ${meRes.status}`);
  const me = await meRes.json();

  const repoList = repos.split(",").map(r => r.trim()).filter(Boolean);
  if (!repoList.length) {
    // Auto-detect repos from user
    const repoRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=5", { headers });
    if (repoRes.ok) {
      const data = await repoRes.json();
      data.forEach(r => repoList.push(r.full_name));
    }
  }

  const results = [];

  for (const fullName of repoList.slice(0, 5)) {
    const repoData = { fullName, readme: "", issues: [], prs: [], description: "" };

    // Repo info
    const infoRes = await fetch(`https://api.github.com/repos/${fullName}`, { headers });
    if (infoRes.ok) {
      const info          = await infoRes.json();
      repoData.description = info.description || "";
      repoData.language    = info.language || "";
      repoData.topics      = info.topics || [];
    }

    // README
    if (includeReadme === "true") {
      const readmeRes = await fetch(`https://api.github.com/repos/${fullName}/readme`, { headers });
      if (readmeRes.ok) {
        const readme = await readmeRes.json();
        repoData.readme = Buffer.from(readme.content, "base64").toString("utf8").slice(0, 2000);
      }
    }

    // Open issues
    if (includeIssues === "true") {
      const issueRes = await fetch(`https://api.github.com/repos/${fullName}/issues?state=open&per_page=10&sort=updated`, { headers });
      if (issueRes.ok) {
        const issues = await issueRes.json();
        repoData.issues = issues
          .filter(i => !i.pull_request)
          .map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name), body: i.body?.slice(0, 200) || "" }));
      }
    }

    // Recent PRs
    if (includePRs === "true") {
      const prRes = await fetch(`https://api.github.com/repos/${fullName}/pulls?state=open&per_page=5&sort=updated`, { headers });
      if (prRes.ok) {
        const prs = await prRes.json();
        repoData.prs = prs.map(p => ({
          number: p.number, title: p.title,
          branch: p.head.ref, author: p.user.login,
          body: p.body?.slice(0, 200) || "",
        }));
      }
    }

    results.push(repoData);
  }

  return {
    user:    { login: me.login, name: me.name },
    repos:   results,
    summary: `${results.length} GitHub repo(s) fetched`,
  };
}

export function githubToContext(data) {
  if (!data?.repos?.length) return "";
  const lines = [`GitHub (${data.repos.length} repo(s)):`];
  for (const repo of data.repos) {
    lines.push(`\nRepo: ${repo.fullName} — ${repo.description}`);
    if (repo.readme) lines.push(`README excerpt: ${repo.readme.slice(0, 300)}`);
    if (repo.issues?.length) {
      lines.push(`Open issues (${repo.issues.length}):`);
      repo.issues.forEach(i => lines.push(`  #${i.number}: ${i.title}${i.labels.length ? ` [${i.labels.join(",")}]` : ""}`));
    }
    if (repo.prs?.length) {
      lines.push(`Open PRs (${repo.prs.length}):`);
      repo.prs.forEach(p => lines.push(`  #${p.number}: ${p.title} (${p.branch} by @${p.author})`));
    }
  }
  return lines.join("\n");
}
