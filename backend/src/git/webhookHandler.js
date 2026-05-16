import crypto from "crypto";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * GitHub signs the payload with the secret you set in repo settings.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) return true; // dev mode — skip verification
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

/**
 * Parse a GitHub webhook event into a normalised PR event.
 * Handles: pull_request, push events.
 */
export function parseWebhookEvent(eventType, payload) {
  if (eventType === "pull_request") {
    const pr = payload.pull_request;
    return {
      kind:       "pull_request",
      action:     payload.action,        // opened | synchronize | closed | reopened
      prNumber:   pr.number,
      prTitle:    pr.title,
      prBody:     pr.body || "",
      branchFrom: pr.head.ref,
      branchTo:   pr.base.ref,
      sha:        pr.head.sha,
      baseSha:    pr.base.sha,
      author:     pr.user.login,
      repoOwner:  payload.repository.owner.login,
      repoName:   payload.repository.name,
      repoFullName: payload.repository.full_name,
      diffUrl:    pr.diff_url,
      htmlUrl:    pr.html_url,
      filesUrl:   `https://api.github.com/repos/${payload.repository.full_name}/pulls/${pr.number}/files`,
    };
  }

  if (eventType === "push") {
    return {
      kind:       "push",
      action:     "push",
      branchFrom: payload.ref?.replace("refs/heads/", ""),
      sha:        payload.after,
      baseSha:    payload.before,
      author:     payload.pusher?.name,
      repoOwner:  payload.repository.owner.login,
      repoName:   payload.repository.name,
      repoFullName: payload.repository.full_name,
      commits:    payload.commits?.map(c => ({ id: c.id, message: c.message, added: c.added, removed: c.removed, modified: c.modified })),
    };
  }

  return null;
}

/**
 * Fetch changed files from a GitHub PR using the API.
 */
export async function fetchPRFiles(prEvent, githubToken) {
  if (!githubToken) return [];

  const res = await fetch(prEvent.filesUrl, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept:        "application/vnd.github.v3+json",
      "User-Agent":  "ATP-Bot",
    },
  });

  if (!res.ok) return [];
  const files = await res.json();
  return files.map(f => ({
    filename:   f.filename,
    status:     f.status,       // added | modified | removed | renamed
    additions:  f.additions,
    deletions:  f.deletions,
    patch:      f.patch?.slice(0, 2000) ?? "", // first 2000 chars of diff
  }));
}
