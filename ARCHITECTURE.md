# Architecture

openfde is a local-first agent system built as a pnpm/TypeScript monorepo.
The spine is the `openfde` CLI — humans and coding agents drive the same
verbs; the web workspace (`openfde serve`) is an optional projection of the
same data. One SQLite ledger per engagement; no server required.

```
data flow:   interviews ──ingest──▶ episodes ──extract──▶ entities/facts
             facts ──recall/context──▶ humans & agents ──remember/task──▶ ledger
             ledger ──projections──▶ notes · graph · executive report
```

## Repository layout

```
packages/
  ontology/                 # THE single source of truth for the domain model
    src/
      entities.ts           #   entity types + trust levels
      relations.ts          #   relation types
      episodes.ts           #   ingestion unit kinds
      extraction.ts         #   LLM structured-output schemas (Zod)

  core/                     # @openfde/core — everything the CLI and UI share
    src/
      engagement/           # one local directory per customer project
        paths.ts            #   OPENFDE_HOME layout, slugs
        store.ts            #   create / list / use / resolve
      ledger/               # the memory engine
        database.ts         #   SQLite schema (episodes, entities, facts, tasks)
        ingest.ts           #   provenance-enforced episode intake (text + PDF/image pointers)
        resolve.ts          #   two-phase writes: dedupe / supersede, never delete
        recall.ts           #   LLM-free search: FTS + 1-hop graph expansion
        search.ts           #   FTS query building, CJK segmentation, stopwords
      extraction/           # ontology-constrained extractors
        extractor.ts        #   the Extractor interface
        anthropic.ts        #   Claude structured-output implementation
        mock.ts             #   offline/deterministic implementation for tests
      dispatch/             # agent-pull task coordination (Mode B)
        tasks.ts            #   task cards, state machine, audit events
        context.ts          #   context bundles: constraints + related memory
      interview/            # dot-line-plane interview guides from graph gaps
        guide.ts            #   top-down (value->flows->points) and bottom-up (mining leads)
      projections/          # markdown views of the ledger (shared by webui & export)
        notes.ts            #   tree + entity/episode/task notes, [[wiki-links]]
      report/               # executive projections
        build.ts            #   derive the four boss questions from the ledger
        markdown.ts         #   markdown rendering
    test/                   # vitest suites, one per module (helpers.ts shared)

  webui/                    # @openfde/webui — the optional local workspace
    src/
      server.ts             #   node:http API + routes (launched by `openfde serve`)
      report-page.ts        #   printable executive report page
      index.html            #   zero-dependency workspace UI (notes + graph)

apps/
  cli/                      # the `openfde` command
    src/
      index.ts              #   thin assembler; registers commands
      commands/             #   one file per verb (engagement, ingest, extract,
                            #   recall, remember, task, context, report, status, serve)
      lib/helpers.ts        #   fail / withLedger / actorName
```

## Where future work lands

| Planned module | Home | Notes |
| --- | --- | --- |
| Ingestion connectors (Slack/Teams exports) | `packages/core/src/ingestion/` | parsers normalize sources into `IngestInput`; PDFs/images already ship via Claude-native blocks; MinerU stays an isolated external service |
| Asset library (prompts, rubrics, eval datasets, skills) | `packages/core/src/assets/` | git-repo-backed, engagement→team promotion behind a desensitization gate |
| Eval execution (rubric scoring of `review` tasks) | `packages/core/src/eval/` | consumes rubric assets, writes scores back; Langfuse optional backend |
| Orchestrated dispatch runner (Mode A) | `packages/core/src/dispatch/runner/` | optional daemon spawning agents on `ready` tasks in git worktrees; same task table |
| Vault export of markdown notes | `apps/cli/src/commands/export.ts` | reuse `core/src/projections/` |
| Embedding recall (sqlite-vec) | `packages/core/src/ledger/` | additive to `recall.ts`; interface unchanged |

## Invariants worth keeping

1. **Ontology has one home.** Entity/relation types exist only in `packages/ontology`.
2. **Provenance is a schema constraint.** Nothing enters the ledger without a `source_uri`; every projection carries citations.
3. **Facts supersede, never delete.** Bi-temporal columns power handoff timelines and audits.
4. **No LLM on the read path.** Recall, context bundles, notes, and reports are deterministic ledger projections; LLMs act only on the write path, constrained by the ontology.
5. **The CLI is the API.** Anything an agent needs must be reachable as a CLI verb with `--json`; `@openfde/webui` renders projections and never grows capabilities the CLI lacks.
6. **Engagements are directories.** Isolation, handoff, backup, and deletion are filesystem operations.
