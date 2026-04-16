# AI Attestation Specification

> This specification is released under CC0 1.0 Universal (public domain).
> You may copy, modify, and use this specification without attribution
> for any purpose.

**Version:** 1.0
**Status:** Stable
**Date:** 2026-04-15

## 1. Purpose and Motivation

Modern software development increasingly involves AI coding assistants. Tools
such as GitHub Copilot, Cursor, Claude Code, Aider, and others generate or
suggest code that ends up in production repositories. Organizations need a
standardized, machine readable way to track:

- How much code in a repository was AI assisted
- Which AI tools were used
- Whether that code has been governance scanned
- What the governance result was

AI Attestation provides that standard. It is a single YAML file placed in the
repository root that captures all of this information. The format is designed
to be human readable, version controllable, and parseable by CI/CD tools,
auditors, and compliance platforms.

## 2. File Location

The attestation file MUST be placed in the repository root:

```
.ai-attestation.yaml
```

The filename starts with a dot (hidden file convention) to match other
config files like `.gitignore` and `.editorconfig`. The `.yaml` extension
is required. JSON is not supported for the primary file, though tools MAY
accept JSON as input for convenience.

## 3. File Format

The file is YAML (YAML Ain't Markup Language). YAML was chosen because:

- It is human readable without tooling
- It visually resembles a declaration, not a config dump
- Comments are supported natively
- It belongs alongside LICENSE and SECURITY.md

The file MUST begin with a comment header identifying it as an AI Attestation
file. Tools SHOULD preserve this header when updating the file.

```yaml
# AI Attestation
# https://oss.korext.com/ai-attestation
#
# This file tracks AI generated code in this repository.
```

## 4. Schema

### 4.1 Top Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | Yes | URL to the JSON Schema definition. Must be `https://oss.korext.com/ai-attestation/schema` for version 1.0. |
| `version` | string | Yes | Schema version. Must be `"1.0"` for this specification. |
| `repo` | object | Yes | Repository metadata. |
| `generated` | string | Yes | ISO 8601 timestamp when this file was last generated or updated. |
| `range` | object | Yes | Time range of commits analyzed. |
| `ai` | object | Yes | AI tool usage data. |
| `governance` | object | No | Governance scanning results. |
| `policy` | object | No | Repository policy configuration. |

### 4.2 repo

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `owner` | string | Yes | Repository owner or organization. | `acme` |
| `name` | string | Yes | Repository name. | `payments-service` |
| `url` | string | No | Full repository URL. | `https://github.com/acme/payments-service` |

### 4.3 range

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `from` | string | No | ISO 8601 start of analysis range. | `2025-01-01T00:00:00Z` |
| `to` | string | No | ISO 8601 end of analysis range. | `2026-04-15T12:00:00Z` |
| `commits` | integer | Yes | Total number of commits analyzed. | `1247` |

### 4.4 ai

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `assisted_commits` | integer | Yes | Number of commits with detected AI tool involvement. | `438` |
| `percentage` | number | Yes | Percentage of commits that were AI assisted (0.0 to 100.0). | `35.1` |
| `tools` | array | Yes | List of detected AI tools. See 4.4.1. | |
| `detection_methods` | array | No | Methods used to detect tool usage. | `["co-author-trailer"]` |

### 4.4.1 tools (array items)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | Yes | Human readable tool name. | `GitHub Copilot` |
| `identifier` | string | Yes | Machine readable identifier. See 4.4.2. | `copilot` |
| `first_seen` | string | No | Date when tool was first detected (YYYY-MM-DD). | `2025-09-01` |
| `last_seen` | string | No | Date when tool was last detected (YYYY-MM-DD). | `2026-04-15` |
| `commit_count` | integer | Yes | Number of commits attributed to this tool. | `312` |

### 4.4.2 Known Tool Identifiers

| Identifier | Tool Name |
|-----------|-----------|
| `copilot` | GitHub Copilot |
| `cursor` | Cursor |
| `claude-code` | Claude Code |
| `codeium` | Codeium |
| `aider` | Aider |
| `codex-cli` | OpenAI Codex CLI |
| `gemini-code-assist` | Gemini Code Assist |
| `windsurf` | Windsurf |
| `tabnine` | Tabnine |
| `devin` | Devin |
| `openhands` | OpenHands |

Tools not in this list MAY use any unique lowercase identifier.
New identifiers SHOULD be submitted as pull requests to the specification
repository.

### 4.5 governance

All governance fields are optional. When a governance engine is not configured,
all fields should be null or their zero values.

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `engine` | string or null | No | Name of governance engine. | `KOREXT` |
| `last_scan` | string or null | No | ISO 8601 timestamp of last scan. | `2026-04-15T10:00:00Z` |
| `result` | string or null | No | Scan result: `PASS`, `WARN`, or `BLOCK`. | `PASS` |
| `score` | integer or null | No | Governance score (0 to 100). | `94` |
| `packs` | array | No | List of governance packs applied. | `["security", "modernization"]` |
| `findings` | object | No | Finding counts by severity. | See 4.5.1. |
| `proof_bundle_url` | string or null | No | URL to the proof bundle. | |
| `proof_bundle_count` | integer | No | Number of proof bundles generated. | `47` |

### 4.5.1 findings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `critical` | integer | No | Number of critical findings. |
| `high` | integer | No | Number of high findings. |
| `medium` | integer | No | Number of medium findings. |
| `low` | integer | No | Number of low findings. |

### 4.6 policy

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `ai_code_requires_review` | boolean | No | Whether AI code requires human review. | `true` |
| `minimum_governance_score` | integer or null | No | Minimum score to pass CI (0 to 100). | `80` |
| `mandatory_packs` | array | No | Packs that must be applied. | `["security"]` |
| `block_unscanned_ai_code` | boolean | No | Block AI code without governance scan. | `true` |

## 5. AI Tool Detection Methods

The following detection methods are defined. Implementations SHOULD support
all methods but MAY implement a subset.

### 5.1 Co-author Trailer

Git commits may include `Co-authored-by` trailers that identify AI tools:

```
Co-authored-by: Copilot <copilot@github.com>
Co-authored-by: Cursor <cursor@cursor.sh>
Co-authored-by: aider (model) <noreply@aider.chat>
```

This is the most reliable detection method. Tools that add co-author
trailers are self-identifying. The email address and name are matched
against a registry of known tool identifiers.

### 5.2 Commit Message Pattern

AI tools may leave recognizable patterns in commit messages:

- "Generated by Copilot"
- "via Cursor"
- "Applied edit from Claude"

Pattern matching SHOULD be applied to the commit subject (first line) only
to reduce false positives. Patterns MUST be based on publicly documented
or publicly observable behaviors.

### 5.3 Metadata Header

Source files may contain headers that identify the generating tool:

```
// Generated by GitHub Copilot
// @cursor-generated
```

This method requires scanning file content and is more resource intensive.
Implementations MAY make this opt-in.

### 5.4 Git Config

Local git configuration may indicate tool presence:

```
git config --get copilot.enabled
```

This detects tool installation, not necessarily usage in specific commits.
Implementations SHOULD use this as supplementary evidence.

## 6. Governance Integration

The `governance` section is designed to be populated by any governance
engine. Engines SHOULD:

1. Read the existing `.ai-attestation.yaml` file
2. Populate the governance fields with scan results
3. Write the updated file back

The governance section is intentionally generic. It does not mandate
any specific engine, scanning methodology, or scoring algorithm.

### 6.1 Proof Bundles

The `proof_bundle_url` field links to externally hosted evidence of
governance compliance. The format and content of proof bundles is
defined by the governance engine, not by this specification.

## 7. Policy Enforcement

The `policy` section enables CI/CD integration. A CI action can:

1. Read the `.ai-attestation.yaml` file
2. Check policy fields against thresholds
3. Pass or fail the build accordingly

Example: if `minimum_governance_score` is 80 and the current
`governance.score` is 72, the CI check fails.

Enforcement is not part of this specification. The policy fields
are informational. CI tools decide how to enforce them.

## 8. Versioning

The `version` field specifies the schema version. This specification
defines version `1.0`.

Future versions will maintain backward compatibility where possible.
New fields will be added as optional. Existing fields will not be
removed or change type without a major version increment.

## 9. Privacy

AI Attestation processes git metadata only:

- Commit messages
- Author names and emails
- Commit dates

It NEVER reads, stores, or transmits source code content. All processing
happens locally. No network calls are made during scanning. No telemetry
is collected.

The `.ai-attestation.yaml` file contains only aggregate counts and
metadata. Individual commit hashes are not stored. No personally
identifiable information beyond what is already public in the git
log is included.

## References

- JSON Schema: https://oss.korext.com/ai-attestation/schema
- CLI: https://www.npmjs.com/package/@korext/ai-attestation
- Web: https://oss.korext.com/ai-attestation
- GitHub: https://github.com/korext/ai-attestation
