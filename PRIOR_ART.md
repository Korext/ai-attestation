# Prior Art

This document catalogs existing
standards and tools related to the
AI Attestation specification and
explains how this work differs.

## Software Bill of Materials (SBOM)

CycloneDX (cyclonedx.org) and SPDX
(spdx.dev) are the dominant SBOM
formats. They catalog dependencies
with version, license, and hash
data. Neither includes AI provenance
fields. AI Attestation complements
SBOM by adding AI authorship data
that these formats do not capture.

## Build Provenance

Sigstore (sigstore.dev) provides
cryptographic signing and
verification for build artifacts.
SLSA (slsa.dev) is a framework of
supply chain security levels
addressing build integrity. Both
focus on build provenance, not AI
authorship during development.

## Vulnerability Databases

CVE (cve.org), OSV (osv.dev), and
tools like Snyk and Dependabot
catalog software vulnerabilities.
AI Attestation addresses a different
concern: which AI tools wrote the
code, not what vulnerabilities
exist in it.

## AI Specific Databases

AVID (avidml.org) catalogs AI model
vulnerabilities and harms. MITRE
ATLAS documents attacks on AI
systems. The AI Incident Database
(incidentdatabase.ai) catalogs
harms from AI systems. These focus
on AI model behavior, not code
authored by AI coding tools.

## How AI Attestation Differs

AI Attestation is the first standard
to track AI coding tool usage at
the commit level. It does not
replace any existing standard. It
fills a gap that none of them
address: which AI tools were used,
how many commits they contributed,
and whether the code was governed.
