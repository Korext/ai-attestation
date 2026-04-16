'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// GitHub Actions core helpers (no dependencies)
const core = {
  getInput(name) {
    const val = process.env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] || '';
    return val.trim();
  },
  setOutput(name, value) {
    const filePath = process.env['GITHUB_OUTPUT'] || '';
    if (filePath) {
      fs.appendFileSync(filePath, `${name}=${value}\n`);
    }
  },
  setFailed(message) {
    console.log(`::error::${message}`);
    process.exitCode = 1;
  },
  warning(message) {
    console.log(`::warning::${message}`);
  },
  notice(message) {
    console.log(`::notice::${message}`);
  },
  info(message) {
    console.log(message);
  },
  summary: {
    _buffer: '',
    addRaw(text) { this._buffer += text; return this; },
    addHeading(text, level) { this._buffer += `${'#'.repeat(level || 2)} ${text}\n\n`; return this; },
    addTable(rows) {
      if (!rows || rows.length === 0) return this;
      // Header
      this._buffer += '| ' + rows[0].map(c => c.data || c).join(' | ') + ' |\n';
      this._buffer += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
      // Rows
      for (let i = 1; i < rows.length; i++) {
        this._buffer += '| ' + rows[i].map(c => c.data || c).join(' | ') + ' |\n';
      }
      this._buffer += '\n';
      return this;
    },
    addSeparator() { this._buffer += '\n---\n\n'; return this; },
    async write() {
      const summaryFile = process.env['GITHUB_STEP_SUMMARY'] || '';
      if (summaryFile) {
        fs.appendFileSync(summaryFile, this._buffer);
      }
    }
  }
};

async function run() {
  try {
    const workspace = process.env['GITHUB_WORKSPACE'] || process.cwd();
    const attestationPath = core.getInput('attestation-path') || '.ai-attestation.yaml';
    const failOnMissing = core.getInput('fail-on-missing') !== 'false';
    const inputMinScore = core.getInput('minimum-governance-score');
    const inputBlockUnscanned = core.getInput('block-unscanned');
    const inputRequireReview = core.getInput('require-review');
    const inputMandatoryPacks = core.getInput('mandatory-packs');

    const filePath = path.join(workspace, attestationPath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      if (failOnMissing) {
        core.setFailed(
          `AI Attestation file not found: ${attestationPath}\n` +
          'Run: npx @korext/ai-attestation init'
        );
      } else {
        core.warning(
          `AI Attestation file not found: ${attestationPath}. ` +
          'Skipping policy check.'
        );
        core.setOutput('result', 'SKIP');
      }
      return;
    }

    // Parse attestation
    const content = fs.readFileSync(filePath, 'utf8');
    let data;
    try {
      data = yaml.load(content);
    } catch (parseErr) {
      core.setFailed(`Failed to parse ${attestationPath}: ${parseErr.message}`);
      return;
    }

    if (!data || !data.schema || !data.version || !data.ai) {
      core.setFailed(`Invalid attestation file. Missing required fields (schema, version, ai).`);
      return;
    }

    // Extract values
    const aiPercentage = data.ai.percentage || 0;
    const aiCommits = data.ai.assisted_commits || 0;
    const totalCommits = data.range ? data.range.commits : 0;
    const tools = (data.ai.tools || []).map(t => t.identifier || t.name);
    const governanceScore = data.governance ? data.governance.score : null;
    const governanceResult = data.governance ? data.governance.result : null;
    const appliedPacks = data.governance ? (data.governance.packs || []) : [];

    // Resolve policy (inputs override file policy)
    const policy = data.policy || {};
    const minScore = inputMinScore !== ''
      ? parseInt(inputMinScore, 10)
      : (policy.minimum_governance_score || null);
    const blockUnscanned = inputBlockUnscanned !== ''
      ? inputBlockUnscanned === 'true'
      : (policy.block_unscanned_ai_code || false);
    const requireReview = inputRequireReview !== ''
      ? inputRequireReview === 'true'
      : (policy.ai_code_requires_review || false);
    const mandatoryPacks = inputMandatoryPacks
      ? inputMandatoryPacks.split(',').map(s => s.trim()).filter(Boolean)
      : (policy.mandatory_packs || []);

    // Run policy checks
    const failures = [];
    const warnings = [];

    // Check 1: Governance score
    if (minScore !== null && minScore > 0) {
      if (governanceScore === null || governanceScore === undefined) {
        failures.push(`Governance score required (minimum ${minScore}) but no governance data found.`);
      } else if (governanceScore < minScore) {
        failures.push(`Governance score ${governanceScore} is below minimum ${minScore}.`);
      }
    }

    // Check 2: Block unscanned AI code
    if (blockUnscanned && aiCommits > 0) {
      if (!data.governance || !data.governance.engine) {
        failures.push('AI code detected but no governance scan has been performed.');
      } else if (governanceResult === 'BLOCK') {
        failures.push('Governance scan result is BLOCK.');
      }
    }

    // Check 3: Mandatory packs
    if (mandatoryPacks.length > 0) {
      const missingPacks = mandatoryPacks.filter(p => !appliedPacks.includes(p));
      if (missingPacks.length > 0) {
        failures.push(`Missing mandatory governance packs: ${missingPacks.join(', ')}.`);
      }
    }

    // Check 4: Review requirement (warning only)
    if (requireReview && aiCommits > 0) {
      warnings.push('AI assisted code requires human review per policy.');
    }

    // Determine result
    let result = 'PASS';
    if (failures.length > 0) {
      result = 'FAIL';
    } else if (warnings.length > 0) {
      result = 'WARN';
    }

    // Set outputs
    core.setOutput('result', result);
    core.setOutput('ai-percentage', aiPercentage.toString());
    core.setOutput('governance-score', governanceScore !== null ? governanceScore.toString() : '');
    core.setOutput('tools-detected', tools.join(','));

    // Build summary
    const summaryLines = [];
    summaryLines.push(`AI Attestation: **${result}**`);
    summaryLines.push(`AI Assisted: ${aiCommits} / ${totalCommits} commits (${aiPercentage}%)`);
    if (tools.length > 0) {
      summaryLines.push(`Tools: ${tools.join(', ')}`);
    }
    if (governanceScore !== null) {
      summaryLines.push(`Governance: ${governanceResult || 'N/A'} (score: ${governanceScore})`);
    }
    core.setOutput('summary', summaryLines.join(' | '));

    // Log results
    core.info('');
    core.info('╔════════════════════════════════════════╗');
    core.info('║          AI Attestation Check          ║');
    core.info('╚════════════════════════════════════════╝');
    core.info('');
    core.info(`  Repository:    ${data.repo.owner}/${data.repo.name}`);
    core.info(`  Total Commits: ${totalCommits}`);
    core.info(`  AI Assisted:   ${aiCommits} (${aiPercentage}%)`);
    core.info(`  Tools:         ${tools.length > 0 ? tools.join(', ') : 'none'}`);
    if (governanceScore !== null) {
      core.info(`  Governance:    ${governanceResult} (score: ${governanceScore})`);
    } else {
      core.info('  Governance:    not configured');
    }
    core.info('');

    // Write job summary
    core.summary
      .addHeading('AI Attestation', 2)
      .addTable([
        [{ data: 'Metric' }, { data: 'Value' }],
        [{ data: 'Result' }, { data: `**${result}**` }],
        [{ data: 'AI Assisted Commits' }, { data: `${aiCommits} / ${totalCommits} (${aiPercentage}%)` }],
        [{ data: 'Tools Detected' }, { data: tools.length > 0 ? tools.join(', ') : 'none' }],
        [{ data: 'Governance Score' }, { data: governanceScore !== null ? `${governanceScore}` : 'N/A' }],
        [{ data: 'Governance Result' }, { data: governanceResult || 'N/A' }],
      ]);

    if (failures.length > 0 || warnings.length > 0) {
      core.summary.addSeparator();
      if (failures.length > 0) {
        core.summary.addHeading('Policy Failures', 3);
        for (const f of failures) {
          core.summary.addRaw(`- ❌ ${f}\n`);
        }
      }
      if (warnings.length > 0) {
        core.summary.addHeading('Warnings', 3);
        for (const w of warnings) {
          core.summary.addRaw(`- ⚠️ ${w}\n`);
        }
      }
    }

    await core.summary.write();

    // Emit failures
    if (failures.length > 0) {
      for (const f of failures) {
        core.info(`  ❌ ${f}`);
      }
      core.info('');
      core.setFailed(`AI Attestation policy check failed: ${failures.length} violation(s)`);
    } else if (warnings.length > 0) {
      for (const w of warnings) {
        core.warning(w);
      }
      core.info(`  ✅ Policy check passed with ${warnings.length} warning(s)`);
    } else {
      core.info('  ✅ Policy check passed');
    }
    core.info('');

  } catch (error) {
    core.setFailed(`Unexpected error: ${error.message}`);
  }
}

run();
