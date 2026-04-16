'use strict';

const { execSync } = require('child_process');
const { TOOLS } = require('./tools');

/**
 * Parse git log output into structured commit objects.
 * Uses a custom format for efficient parsing without loading diffs.
 */
function parseGitLog(raw) {
  const commits = [];
  const entries = raw.split('\n---COMMIT-BOUNDARY---\n').filter(Boolean);

  for (const entry of entries) {
    const lines = entry.trim().split('\n');
    if (lines.length < 3) continue;

    const hash = lines[0];
    const date = lines[1];
    const message = lines.slice(2).join('\n');

    commits.push({ hash, date, message });
  }

  return commits;
}

/**
 * Get git log for a repository.
 */
function getGitLog(repoPath, since) {
  const sinceArg = since ? `--since="${since}"` : '';
  const format = '--format=%H%n%aI%n%B%n---COMMIT-BOUNDARY---';

  try {
    const raw = execSync(
      `git log ${format} ${sinceArg} --no-merges`,
      {
        cwd: repoPath,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    return parseGitLog(raw);
  } catch (err) {
    if (err.stderr && err.stderr.includes('does not have any commits')) {
      return [];
    }
    if (err.stderr && err.stderr.includes('not a git repository')) {
      throw new Error('Not a git repository. Run this command from inside a git project.');
    }
    throw err;
  }
}

/**
 * Extract co-author emails from a commit message.
 */
function extractCoAuthors(message) {
  const coAuthors = [];
  const pattern = /Co-authored-by:\s*(.+)\s*<([^>]+)>/gi;
  let match;
  while ((match = pattern.exec(message)) !== null) {
    coAuthors.push({
      name: match[1].trim(),
      email: match[2].trim().toLowerCase()
    });
  }
  return coAuthors;
}

/**
 * Detect AI tools used in a single commit.
 * Returns array of { id, name, method } objects.
 */
function detectToolsInCommit(commit) {
  const detected = [];
  const seen = new Set();
  const coAuthors = extractCoAuthors(commit.message);

  for (const tool of TOOLS) {
    if (seen.has(tool.id)) continue;

    // Method 1: Co-author email match
    for (const ca of coAuthors) {
      if (tool.coAuthorEmails.some(e => ca.email === e.toLowerCase())) {
        detected.push({ id: tool.id, name: tool.name, method: 'co-author-trailer' });
        seen.add(tool.id);
        break;
      }
    }
    if (seen.has(tool.id)) continue;

    // Method 1b: Co-author name pattern match
    for (const ca of coAuthors) {
      if (tool.coAuthorPatterns && tool.coAuthorPatterns.some(p => p.test(ca.name))) {
        detected.push({ id: tool.id, name: tool.name, method: 'co-author-trailer' });
        seen.add(tool.id);
        break;
      }
    }
    if (seen.has(tool.id)) continue;

    // Method 2: Commit message pattern match
    // Only match on the first line or subject to reduce false positives
    const subject = commit.message.split('\n')[0];
    if (tool.commitPatterns.some(p => p.test(subject))) {
      detected.push({ id: tool.id, name: tool.name, method: 'commit-message-pattern' });
      seen.add(tool.id);
    }
  }

  return detected;
}

/**
 * Check git config for tool presence.
 */
function checkGitConfig(repoPath) {
  const detected = [];

  for (const tool of TOOLS) {
    for (const key of tool.configKeys) {
      try {
        const value = execSync(`git config --get ${key}`, {
          cwd: repoPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        if (value) {
          detected.push({ id: tool.id, name: tool.name, method: 'git-config' });
        }
      } catch {
        // Config key not set, skip
      }
    }
  }

  return detected;
}

/**
 * Main detection function.
 * Scans git history and returns AI tool usage data.
 */
function detectAIUsage(repoPath, options = {}) {
  const since = options.since || '1 year ago';

  // Verify git repo
  try {
    execSync('git rev-parse --git-dir', {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    throw new Error('Not a git repository. Run this command from inside a git project.');
  }

  const commits = getGitLog(repoPath, since);

  if (commits.length === 0) {
    return {
      totalCommits: 0,
      aiAssistedCommits: 0,
      percentage: 0,
      tools: {},
      detectionMethods: [],
      range: {
        from: null,
        to: null,
        commits: 0
      }
    };
  }

  const results = {
    totalCommits: commits.length,
    aiAssistedCommits: 0,
    percentage: 0,
    tools: {},
    detectionMethods: new Set(),
    range: {
      from: commits[commits.length - 1].date,
      to: commits[0].date,
      commits: commits.length
    }
  };

  for (const commit of commits) {
    const detected = detectToolsInCommit(commit);
    if (detected.length > 0) {
      results.aiAssistedCommits++;
      for (const tool of detected) {
        if (!results.tools[tool.id]) {
          results.tools[tool.id] = {
            id: tool.id,
            name: tool.name,
            firstSeen: commit.date,
            lastSeen: commit.date,
            commitCount: 0
          };
        }

        const existing = results.tools[tool.id];
        // Update date range (commits are newest first)
        if (commit.date < existing.firstSeen) {
          existing.firstSeen = commit.date;
        }
        if (commit.date > existing.lastSeen) {
          existing.lastSeen = commit.date;
        }
        existing.commitCount++;
        results.detectionMethods.add(tool.method);
      }
    }
  }

  results.percentage = results.totalCommits > 0
    ? Math.round((results.aiAssistedCommits / results.totalCommits) * 1000) / 10
    : 0;

  results.detectionMethods = Array.from(results.detectionMethods);

  // Also check git config
  const configTools = checkGitConfig(repoPath);
  for (const tool of configTools) {
    if (!results.tools[tool.id]) {
      results.tools[tool.id] = {
        id: tool.id,
        name: tool.name,
        firstSeen: null,
        lastSeen: null,
        commitCount: 0
      };
    }
    if (!results.detectionMethods.includes('git-config')) {
      results.detectionMethods.push('git-config');
    }
  }

  return results;
}

/**
 * Detect tools in a single commit message string.
 * Used by the git hook for incremental updates.
 */
function detectSingleCommit(message) {
  const commit = { hash: '', date: new Date().toISOString(), message };
  return detectToolsInCommit(commit);
}

/**
 * Get repo info from git remote.
 */
function getRepoInfo(repoPath) {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Parse SSH format: git@github.com:owner/repo.git
    let match = remote.match(/git@[^:]+:([^/]+)\/([^.]+)(\.git)?$/);
    if (match) {
      return { owner: match[1], name: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
    }

    // Parse HTTPS format: https://github.com/owner/repo.git
    match = remote.match(/https?:\/\/[^/]+\/([^/]+)\/([^/.]+)(\.git)?$/);
    if (match) {
      return { owner: match[1], name: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
    }

    return { owner: 'unknown', name: 'unknown', url: remote };
  } catch {
    return { owner: 'unknown', name: 'unknown', url: '' };
  }
}

module.exports = {
  detectAIUsage,
  detectSingleCommit,
  detectToolsInCommit,
  getRepoInfo,
  getGitLog,
  extractCoAuthors
};
