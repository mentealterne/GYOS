# AGENTS.md

Instructions for coding agents working on **GYOS**, the Claude Code plugin that implements
Knowledge-Driven Programming. This file is a map: it says where things are and which rules
hold. The detail lives in the files it points to.

## What this repo is

GYOS is a **generator**. It ships as a Claude Code plugin, and the repo is its own marketplace.
What it generates lives in the user's repo and must work without GYOS installed. Read
[`docs/plan.md`](docs/plan.md) before changing anything substantial.

| Path | Holds | Changes when |
| --- | --- | --- |
| `docs/plan.md` | What GYOS is, the init flow, the commands, the roadmap, the dated decisions | A decision changes: add a dated row, never rewrite an old one |
| `standards/` | What GYOS enforces: the shape of a module, of a domain skill | Before any template or skill that follows it |
| `knowledge/` | What GYOS knows, with sources: the reasons behind the standards | Research changes a conclusion |
| `templates/` | Files copied as they are into a user's repo | After the standard they implement |
| `skills/` | The plugin's skills, invoked as `/gyos:<name>` | — |
| `scripts/` | Deterministic tooling: scaffolding, checks | — |
| `.claude-plugin/` | `plugin.json` and `marketplace.json` | A release, or a new plugin field |

## Order of work

**Standard → template → skill.** A skill never encodes a rule the standard doesn't state. A
template never contradicts its standard. When building a template proves the standard wrong, fix
the standard in the same change and say so.

## Rules

- **Ask, never invent.** This holds for GYOS's own docs too: no claim about a tool, a library or a
  practice without a source. In `knowledge/`, every claim cites one. Where sources disagree, say
  so and say which side GYOS takes. Version-dependent details carry a version and a date.
- **Generated skills are self-contained.** `${CLAUDE_PLUGIN_ROOT}` is substituted only in the
  plugin's own skills. Whatever a generated skill needs is copied into the user's repo.
- **Plugin skills load knowledge in pieces.** A skill links to `${CLAUDE_PLUGIN_ROOT}/knowledge/…`
  and says when to read each file. Keep each `SKILL.md` under 500 lines.
- **Decisions are append-only.** A change of mind is a new dated entry that supersedes the old one.
- **English** for everything in the repo. Plain words, short sentences.

## Git

- One branch per change, a pull request, and the CI green before merging. `main` is protected:
  no direct pushes, no force pushes.
- Commit messages say what changed and why.

## Checks

Run both before opening a pull request. CI runs the same.

```sh
claude plugin validate --strict .                          # the marketplace and the plugin
claude plugin validate --strict .claude-plugin/plugin.json
node scripts/check-links.ts                                # relative links and anchors in *.md
```
