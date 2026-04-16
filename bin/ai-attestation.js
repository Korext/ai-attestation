#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { detectAIUsage, detectSingleCommit, getRepoInfo } = require('../src/detect');
const { buildAttestation, writeAttestation, readAttestation, updateAttestation } = require('../src/yaml-writer');
const { installHook, removeHook } = require('../src/hook');

// ANSI color codes
const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  underline: isTTY ? '\x1b[4m' : '',
  white: isTTY ? '\x1b[37m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  green: isTTY ? '\x1b[32m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  red: isTTY ? '\x1b[31m' : '',
  boldWhite: isTTY ? '\x1b[1;37m' : '',
  boldCyan: isTTY ? '\x1b[1;36m' : '',
  boldGreen: isTTY ? '\x1b[1;32m' : '',
  boldYellow: isTTY ? '\x1b[1;33m' : '',
  boldBlue: isTTY ? '\x1b[1;34m' : '',
  underlineBlue: isTTY ? '\x1b[4;34m' : '',
};

const VERSION = '1.0.0';

// Parse arguments
const args = process.argv.slice(2);
const command = args[0] || '';
const subcommand = args[1] || '';

function printVersion() {
  console.log(`ai-attestation ${VERSION}`);
}

function printHelp() {
  console.log(`
${c.boldWhite}AI Attestation${c.reset} ${c.dim}v${VERSION}${c.reset}
${c.dim}Track and attest AI generated code in your repository.${c.reset}

${c.boldWhite}Usage:${c.reset}
  ai-attestation <command> [options]

${c.boldWhite}Commands:${c.reset}
  ${c.cyan}init${c.reset}            Scan history, create attestation, install hook
  ${c.cyan}scan${c.reset}            Re-scan and update .ai-attestation.yaml
  ${c.cyan}badge${c.reset}           Generate badge markdown
  ${c.cyan}report${c.reset}          Print attestation summary
  ${c.cyan}hook install${c.reset}    Install git hook
  ${c.cyan}hook remove${c.reset}     Remove git hook

${c.boldWhite}Options:${c.reset}
  --help          Show this help message
  --version       Show version number
  --type <type>   Hook type: post-commit (default) or pre-commit

${c.boldWhite}Quick start:${c.reset}
  ${c.dim}$${c.reset} npx @korext/ai-attestation init

${c.dim}https://oss.korext.com/ai-attestation${c.reset}
`);
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function printBox(title) {
  if (!isTTY) {
    console.log(title);
    console.log('');
    return;
  }
  const width = 40;
  const top = '\u2554' + '\u2550'.repeat(width) + '\u2557';
  const bot = '\u255A' + '\u2550'.repeat(width) + '\u255D';
  const pad = title.length;
  const left = Math.floor((width - pad) / 2);
  const right = width - pad - left;
  const mid = '\u2551' + ' '.repeat(left) + title + ' '.repeat(right) + '\u2551';
  console.log(`${c.boldWhite}${top}${c.reset}`);
  console.log(`${c.boldWhite}${mid}${c.reset}`);
  console.log(`${c.boldWhite}${bot}${c.reset}`);
  console.log('');
}

function printResults(detection, repoInfo, options = {}) {
  const { showCreated, showInstalled } = options;

  printBox('AI Attestation');

  console.log(`  ${c.dim}Repository:${c.reset} ${repoInfo.owner}/${repoInfo.name}`);
  console.log(`  ${c.dim}Scanned:${c.reset} ${c.boldCyan}${formatNumber(detection.totalCommits)}${c.reset} commits (last 12 months)`);
  console.log('');

  console.log(`  ${c.dim}AI Assisted Commits:${c.reset} ${c.boldCyan}${formatNumber(detection.aiAssistedCommits)}${c.reset} (${c.boldCyan}${detection.percentage}%${c.reset})`);
  console.log('');

  const tools = Object.values(detection.tools).filter(t => t.commitCount > 0);
  if (tools.length > 0) {
    console.log(`  ${c.dim}Tools detected:${c.reset}`);
    tools.sort((a, b) => b.commitCount - a.commitCount);
    for (const tool of tools) {
      const nameStr = tool.name.padEnd(20);
      const countStr = `${formatNumber(tool.commitCount)} commits`.padEnd(15);
      const dateStr = tool.firstSeen ? `(first seen ${formatDate(tool.firstSeen)})` : '';
      console.log(`    ${c.white}${nameStr}${c.reset} ${countStr} ${c.dim}${dateStr}${c.reset}`);
    }
  } else {
    console.log(`  ${c.dim}Tools detected:${c.reset} none`);
  }
  console.log('');

  // Governance
  console.log(`  ${c.dim}Governance:${c.reset} ${c.yellow}not configured${c.reset}`);
  console.log(`    ${c.dim}Add governance scanning:${c.reset}`);
  console.log(`    ${c.dim}npm install -g korext && korext init${c.reset}`);
  console.log('');

  if (showCreated) {
    console.log(`  ${c.green}Created:${c.reset} .ai-attestation.yaml`);
  }
  if (showInstalled) {
    console.log(`  ${c.green}Installed:${c.reset} .git/hooks/post-commit`);
  }
  if (showCreated || showInstalled) {
    console.log('');
  }

  // Badge
  const badgeUrl = `https://oss.korext.com/badge/${repoInfo.owner}/${repoInfo.name}`;
  const reportUrl = `https://oss.korext.com/report/${repoInfo.owner}/${repoInfo.name}`;
  console.log(`  ${c.dim}Add this badge to your README:${c.reset}`);
  console.log('');
  console.log(`  ${c.underlineBlue}[![AI Attestation](${badgeUrl})](${reportUrl})${c.reset}`);
  console.log('');
}

// Commands
function cmdInit() {
  const cwd = process.cwd();
  const repoInfo = getRepoInfo(cwd);
  const detection = detectAIUsage(cwd);

  if (detection.totalCommits === 0) {
    console.log(`${c.yellow}No commits found in this repository.${c.reset}`);
    console.log(`${c.dim}Make some commits first, then run ai-attestation init again.${c.reset}`);
    process.exit(0);
  }

  const data = buildAttestation(repoInfo, detection);
  writeAttestation(cwd, data);
  const hookResult = installHook(cwd);

  printResults(detection, repoInfo, {
    showCreated: true,
    showInstalled: hookResult.installed
  });
}

function cmdScan() {
  const cwd = process.cwd();
  const existing = readAttestation(cwd);
  const repoInfo = getRepoInfo(cwd);
  const detection = detectAIUsage(cwd);
  const data = buildAttestation(repoInfo, detection);
  writeAttestation(cwd, data);

  if (existing) {
    const oldCommits = existing.range ? existing.range.commits : 0;
    const oldAI = existing.ai ? existing.ai.assisted_commits : 0;
    const oldPct = existing.ai ? existing.ai.percentage : 0;
    const newCommits = data.range.commits;
    const newAI = data.ai.assisted_commits;
    const newPct = data.ai.percentage;

    console.log(`  ${c.green}Updated${c.reset} .ai-attestation.yaml`);
    console.log(`    ${c.dim}Commits:${c.reset} ${formatNumber(oldCommits)} -> ${c.boldCyan}${formatNumber(newCommits)}${c.reset} (${newCommits - oldCommits >= 0 ? '+' : ''}${newCommits - oldCommits})`);
    console.log(`    ${c.dim}AI assisted:${c.reset} ${formatNumber(oldAI)} -> ${c.boldCyan}${formatNumber(newAI)}${c.reset} (${newAI - oldAI >= 0 ? '+' : ''}${newAI - oldAI})`);
    console.log(`    ${c.dim}Percentage:${c.reset} ${oldPct}% -> ${c.boldCyan}${newPct}%${c.reset}`);

    // Check for new tools
    const oldTools = new Set((existing.ai && existing.ai.tools ? existing.ai.tools : []).map(t => t.identifier));
    const newTools = data.ai.tools.filter(t => !oldTools.has(t.identifier));
    for (const t of newTools) {
      console.log(`    ${c.green}New tool:${c.reset} ${t.name} (${t.commit_count} commits)`);
    }
  } else {
    console.log(`  ${c.green}Created${c.reset} .ai-attestation.yaml`);
  }
  console.log('');
}

function cmdBadge() {
  const cwd = process.cwd();
  const repoInfo = getRepoInfo(cwd);
  const data = readAttestation(cwd);

  const badgeUrl = `https://oss.korext.com/badge/${repoInfo.owner}/${repoInfo.name}`;
  const reportUrl = `https://oss.korext.com/report/${repoInfo.owner}/${repoInfo.name}`;

  if (data && data.governance && data.governance.score) {
    console.log(`[![AI Governed: ${data.governance.score}%](${badgeUrl})](${reportUrl})`);
  } else {
    console.log(`[![AI Attestation](${badgeUrl})](${reportUrl})`);
  }
}

function cmdReport() {
  const cwd = process.cwd();
  const repoInfo = getRepoInfo(cwd);
  const detection = detectAIUsage(cwd);
  printResults(detection, repoInfo);
}

function cmdHookInstall() {
  const cwd = process.cwd();
  const type = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'post-commit';
  const result = installHook(cwd, type);
  if (result.installed) {
    console.log(`  ${c.green}Installed${c.reset} .git/hooks/${type}`);
  } else {
    console.log(`  ${c.dim}Hook already installed${c.reset}`);
  }
}

function cmdHookRemove() {
  const cwd = process.cwd();
  const type = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'post-commit';
  const result = removeHook(cwd, type);
  if (result.removed) {
    console.log(`  ${c.green}Removed${c.reset} .git/hooks/${type}`);
  } else {
    console.log(`  ${c.dim}${result.reason}${c.reset}`);
  }
}

/**
 * Hook update command (called by git hook, not user-facing).
 * Reads latest commit and incrementally updates the attestation.
 */
function cmdHookUpdate() {
  const cwd = process.cwd();
  try {
    const { execSync } = require('child_process');
    const message = execSync('git log -1 --format=%B', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const detected = detectSingleCommit(message);
    updateAttestation(cwd, message, detected);
  } catch {
    // Silently fail in hook context
  }
}

// Main
try {
  if (args.includes('--version') || args.includes('-v')) {
    printVersion();
  } else if (args.includes('--help') || args.includes('-h') || command === 'help') {
    printHelp();
  } else if (command === 'init') {
    cmdInit();
  } else if (command === 'scan') {
    cmdScan();
  } else if (command === 'badge') {
    cmdBadge();
  } else if (command === 'report') {
    cmdReport();
  } else if (command === 'hook' && subcommand === 'install') {
    cmdHookInstall();
  } else if (command === 'hook' && subcommand === 'remove') {
    cmdHookRemove();
  } else if (command === 'hook-update') {
    cmdHookUpdate();
  } else if (command === '') {
    printHelp();
  } else {
    console.error(`${c.red}Unknown command: ${command}${c.reset}`);
    console.error(`${c.dim}Run ai-attestation --help for usage.${c.reset}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
}
