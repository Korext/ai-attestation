'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POST_COMMIT_HOOK = `#!/bin/sh
# AI Attestation post-commit hook
# Updates .ai-attestation.yaml after each commit
# Installed by @korext/ai-attestation

# Get the latest commit message
COMMIT_MSG=$(git log -1 --format=%B)

# Find ai-attestation binary
AI_ATTESTATION=""
if command -v ai-attestation > /dev/null 2>&1; then
  AI_ATTESTATION="ai-attestation"
elif [ -f "./node_modules/.bin/ai-attestation" ]; then
  AI_ATTESTATION="./node_modules/.bin/ai-attestation"
elif command -v npx > /dev/null 2>&1; then
  AI_ATTESTATION="npx --yes @korext/ai-attestation"
fi

if [ -n "$AI_ATTESTATION" ]; then
  $AI_ATTESTATION hook-update > /dev/null 2>&1 || true
fi
`;

const PRE_COMMIT_HOOK = `#!/bin/sh
# AI Attestation pre-commit hook
# Auto-stages .ai-attestation.yaml before each commit
# Installed by @korext/ai-attestation

if [ -f ".ai-attestation.yaml" ]; then
  git add .ai-attestation.yaml 2>/dev/null || true
fi
`;

/**
 * Install a git hook.
 */
function installHook(repoPath, type) {
  const hookType = type || 'post-commit';
  const gitDir = getGitDir(repoPath);
  const hooksDir = path.join(gitDir, 'hooks');

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, hookType);
  const hookContent = hookType === 'pre-commit' ? PRE_COMMIT_HOOK : POST_COMMIT_HOOK;

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes('ai-attestation')) {
      return { installed: false, reason: 'already installed' };
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, '\n' + hookContent, 'utf8');
  } else {
    fs.writeFileSync(hookPath, hookContent, 'utf8');
  }

  // Make executable
  fs.chmodSync(hookPath, '755');

  return { installed: true, path: hookPath };
}

/**
 * Remove the AI Attestation git hook.
 */
function removeHook(repoPath, type) {
  const hookType = type || 'post-commit';
  const gitDir = getGitDir(repoPath);
  const hookPath = path.join(gitDir, 'hooks', hookType);

  if (!fs.existsSync(hookPath)) {
    return { removed: false, reason: 'hook not found' };
  }

  const content = fs.readFileSync(hookPath, 'utf8');
  if (!content.includes('ai-attestation')) {
    return { removed: false, reason: 'not an ai-attestation hook' };
  }

  // If the entire file is our hook, remove it
  if (content.includes('# AI Attestation') && !content.includes('\n#!/')) {
    fs.unlinkSync(hookPath);
  } else {
    // Remove only our section
    const cleaned = content.replace(/# AI Attestation[\s\S]*?(?=\n#!|$)/g, '').trim();
    if (cleaned) {
      fs.writeFileSync(hookPath, cleaned, 'utf8');
    } else {
      fs.unlinkSync(hookPath);
    }
  }

  return { removed: true };
}

/**
 * Get the .git directory for a repo.
 */
function getGitDir(repoPath) {
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return path.resolve(repoPath, gitDir);
  } catch {
    throw new Error('Not a git repository.');
  }
}

module.exports = {
  installHook,
  removeHook,
  getGitDir
};
