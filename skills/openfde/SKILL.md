---
name: openfde
description: >-
  Operate the OpenFDE engagement memory from the command line. Use this skill
  whenever you are working inside a customer engagement that has an openfde
  ledger: to recall customer facts before answering ("what did the customer
  say about X", "who owns Y"), to pick up and advance task cards, to pull the
  context bundle before starting implementation work, to record discoveries
  mid-task, or to judge finished work against its rubric. Trigger phrases:
  "check the engagement memory", "claim a task", "what do we know about",
  "record this finding", "run the eval".
---

# openfde — engagement memory for agents

OpenFDE is a local-first AI workspace for forward deployed engineers. Humans
look at the web workspace (`openfde serve`); **you drive the same ledger
through this CLI**. Every command supports `--json`; every fact carries a
citation back to its source.

## Install (one-time)

Prerequisites: Node.js >= 22 and pnpm.

```sh
git clone https://github.com/memovai/openfde.git
cd openfde
pnpm install
pnpm -C apps/cli build
npm link ./apps/cli        # exposes the `openfde` binary on PATH
openfde --version          # verify
```

Optional environment:

- `ANTHROPIC_API_KEY` — required only for `extract` (LLM extraction),
  `research` (web search), and `eval` without `--mock`.
- `OPENFDE_ACTOR` — your identity in audit trails (defaults to `$USER`).
  As a coding agent, set it: `export OPENFDE_ACTOR=claude-code`.
- `OPENFDE_HOME` — data location (defaults to `~/.openfde`).

To install this skill itself, copy this directory into the project
(`.claude/skills/openfde/`) or user scope (`~/.claude/skills/openfde/`).

## The engagement

All data lives in one engagement (customer project) at a time:

```sh
openfde engagement list            # * marks the current one
openfde engagement use <slug>      # switch
openfde status                     # counts: episodes, facts, open tasks
```

If a command fails with "no engagement selected", ask the human which
engagement to use — do not create one on your own.

## The loop you run as an agent

```sh
# 1. find work
openfde task list --status ready --json

# 2. claim it and pull the ammunition pack BEFORE touching code
openfde task claim <id>
openfde context <id>          # constraints first, related memory after — read all of it

# 3. work; report progress as you go
openfde task start <id>
openfde task update <id> --note "found the export job config"

# 4. record discoveries the moment you make them (provenance is mandatory)
openfde remember "the nightly export runs at 02:00 UTC, owned by Wang" \
  --source "repo://acme/etl/cron.tf#L14"

# 5. submit for review
openfde task done <id> --note "ready for eval"
```

Never skip step 2: the context bundle leads with **constraints** (security
rules, compliance limits). A demo or change that violates one kills the
engagement's trust.

## Memory verbs

```sh
openfde recall <query> --json               # hybrid search: rank-fused, scored, citations included
openfde recall <query> --mode handoff       # timeline incl. superseded facts
openfde whoknows <topic> --json             # who is the expert — evidence-cited people ranking
openfde remember "<fact>" --source <uri>    # write back; source URI is REQUIRED
openfde ingest notes.md --kind message --speaker Wang    # files, PDFs, images
openfde extract                              # structure pending episodes (needs API key)
```

Rules:
- Everything you `remember` must carry a real `--source` (file path, URL,
  repo path, meeting reference). Sourceless writes are rejected by design.
- `recall` is milliseconds and LLM-free — prefer it over guessing customer
  facts from your own context.
- When `recall` reports matching unextracted episodes, run `openfde extract`
  before concluding the memory has nothing on the topic.

## Field tools

```sh
openfde research "<how do others solve X>" --save   # web search, cited; --save ingests findings
openfde demo <topic> --save                          # demo brief: pain, vocabulary, constraints, data shapes
openfde interview --mode top-down                    # boss-session questions from graph gaps
openfde interview --mode bottom-up                   # knowledge-mining leads
openfde datamap                                      # who owns / trusts / depends on each data source
openfde flows                                        # auto-extracted mermaid flow diagrams (goals, steps, blockers)
openfde report                                       # executive report (markdown)
```

## Pages

Free-form markdown documents (runbooks, plans, deliverables) that live next
to the ledger. Humans block-edit them in the workspace; you read and write
the same files:

```sh
openfde page list --json
openfde page show <slug>
openfde page add "Rollout plan" --file ./plan.md
openfde page edit <slug> --file ./updated.md
```

Use pages for narrative deliverables; use `remember` for facts. A fact
buried in a page is invisible to `recall` until you record it.

The canvas (`openfde canvas show/add`) is the human's free-form thinking
surface — read it for context; add a card only when asked.

## Eval and assets

Task acceptance criteria become rubric assets automatically. When you finish
a piece of work, judge it before asking a human to review:

```sh
openfde eval <taskId> --input ./summary-of-work.md   # LLM judge (or --mock)
openfde asset list                                   # rubrics, prompts, eval cases, demos
openfde asset show rubric <name>
openfde asset add prompt "extraction tone" --file ./prompt.md
```

Verdicts append to the task's audit trail and grow the per-rubric
`.cases.jsonl` dataset.

## Ground rules

1. **Cite or it didn't happen.** Every fact you rely on should come from
   `recall`/`context` output (which carries sources), not from your priors.
2. **Constraints outrank everything** — including the human's phrasing of the
   task. If a task conflicts with a recorded constraint, say so in a
   `task update --note` and pause.
3. **Write back as you learn.** A discovery not recorded with `remember` is
   lost to the next agent and to the handoff.
4. **State transitions, never silence.** Finish with `task done`, block with
   an explanatory note, abandon with `task ready`. The audit trail is the
   human's window into your work.
5. The web workspace (`openfde serve`, `/report`, `openfde share`) is for
   humans; do not scrape it — everything it shows comes from these commands.
