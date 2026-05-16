# Code Intelligence Product Guide

This guide defines TraceSpace code intelligence: local repository
understanding, architecture maps, refactor roadmaps, and developer handoff
without turning normal user workflows into developer tools.

## Purpose

TraceSpace should help developers understand codebases as source-backed
structure: modules, dependencies, risks, refactor candidates, onboarding maps,
and implementation tasks.

The goal is not to replace an IDE or automate code changes blindly. The goal is
to produce reviewable code intelligence and handoff artifacts.

## Target Users

- Developers reviewing unfamiliar codebases.
- Technical leads planning refactors.
- Agents preparing bounded implementation work.
- Reviewers converting architecture findings into issues or tasks.

## Supported Sources

Useful source material includes:

- Local repository files.
- README and architecture notes.
- Test files.
- Configuration files.
- Dependency manifests.
- CI logs or failure summaries.
- Existing roadmap and developer notes.

## Product Rules

- Repository scanning should be local-first.
- Read-only analysis is the default.
- File allowlists and ignore rules must be respected.
- Generated findings should cite files or code evidence.
- Generated changes, issues, or roadmaps are drafts until accepted.
- Code intelligence should remain gated and should not appear as a standard
  non-developer workspace preset.

## Expected Outputs

TraceSpace should support:

- Repository map.
- Architecture dependency graph.
- Risk and hotspot report.
- Refactor roadmap.
- Developer onboarding map.
- Test gap report.
- GitHub issue candidates.
- monday task candidates.
- Miro architecture map candidates.

## Review Language

Preferred language:

```text
Finding
Evidence
Risk
Candidate issue
Suggested refactor
Needs developer review
```

Avoid unsupported language:

```text
Guaranteed bug
Safe automatic refactor
Production-ready change
```

## Validation Intent

Validate that code intelligence:

1. Respects local path and ignore rules.
2. Cites files and relevant symbols for findings.
3. Separates evidence from inference.
4. Produces roadmap or issue candidates as reviewable drafts.
5. Does not mutate code or create issues without explicit approval.
6. Can export accepted developer handoff artifacts to Markdown, monday.com, or
   Miro when appropriate.

## Future Roadmap

- Add repo scan fixtures.
- Add allowlist and security hardening.
- Add refactor roadmap artifacts.
- Add GitHub issue candidate preview.
- Add Miro architecture and monday task handoffs after review.
