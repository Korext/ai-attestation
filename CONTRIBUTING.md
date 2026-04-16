# Contributing to AI Attestation

Thank you for your interest in contributing to the AI Attestation standard.

## Adding a New AI Tool

To add a new AI coding tool to the detection registry:

1. Fork the repository
2. Edit `src/tools.js`
3. Add a new entry with the following fields:

```javascript
{
  id: 'tool-name',           // Lowercase, unique identifier
  name: 'Tool Display Name', // Human readable name
  coAuthorEmails: [],         // Known co-author trailer emails
  coAuthorPatterns: [],       // Regex patterns for co-author names
  commitPatterns: [],         // Regex patterns for commit messages
  fileHeaders: [],            // Regex patterns for file header comments
  configKeys: []              // Git config keys that indicate tool presence
}
```

4. Include evidence for each pattern:
   - Link to official documentation showing the pattern
   - Link to public GitHub commits demonstrating the pattern
   - Screenshot or reference to tool settings that produce the pattern

5. Mark unverified patterns with a comment: `// Community reported`

6. Submit a pull request with:
   - The tool entry in `src/tools.js`
   - A brief description of the tool
   - Links to evidence for each detection pattern

## Reporting False Positives

If AI Attestation incorrectly identifies a commit as AI assisted:

1. Open an issue with the title "False positive: [tool name]"
2. Include the commit message that triggered the false detection
3. Explain why the detection is incorrect
4. Suggest a more specific pattern if possible

## Spec Changes

Changes to the specification (SPEC.md) and schema (schema.json) require
discussion before implementation:

1. Open an issue describing the proposed change
2. Include rationale and backward compatibility analysis
3. Wait for maintainer feedback before submitting a PR

The specification is versioned. Breaking changes require a major version
increment. New optional fields can be added in minor versions.

## Code Style

- The CLI has one dependency: `js-yaml` (^4.1.0)
- Everything else uses built in modules (`fs`, `path`, `child_process`)
- No chalk, no commander, no inquirer, no minimist
- Colors use raw ANSI escape codes
- Arguments use manual parsing
- Git operations use `child_process.execSync`

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Test locally:
   - Create a test git repo with AI assisted commits
   - Run `node bin/ai-attestation.js init`
   - Verify detection results
5. Submit a pull request
6. Wait for code review

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
Please read it before participating.

## License

By contributing, you agree that your contributions will be licensed under:
- Apache 2.0 for code (CLI, tools, action)
- CC0 1.0 Universal for the specification and schema
