import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import {
  addCanvasCard,
  buildDataMap,
  buildFlows,
  buildInterviewGuide,
  buildOverviewFlow,
  buildReport,
  createPage,
  dataMapMarkdown,
  deletePage,
  entityNote,
  flowsMarkdown,
  interviewMarkdown,
  listAssets,
  listPages,
  listTasks,
  episodeNote,
  listEngagements,
  loadTree,
  openLedger,
  readCanvas,
  readPage,
  recall,
  resolveEngagement,
  resolveEntityByName,
  taskNote,
  transitionTask,
  writeCanvas,
  writePage,
  type CanvasData,
  type InterviewMode,
  type Ledger,
  type TaskStatus,
} from "@openfde/core";
import { reportPage } from "./report-page.js";

interface GraphNode {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  trust: string | null;
  degree: number;
}

interface GraphLink {
  source: string;
  target: string;
  predicate: string;
  factId: string;
  statement: string;
  expired: boolean;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function loadGraph(slug: string, includeExpired: boolean) {
  const db = openLedger(slug);
  try {
    const nodes = db
      .prepare(`SELECT id, type, name, summary, trust FROM entities WHERE expired_at IS NULL`)
      .all() as Omit<GraphNode, "degree">[];

    const expiredFilter = includeExpired ? "" : "AND f.expired_at IS NULL";
    const links = db
      .prepare(
        `SELECT f.id AS factId, f.subject_id AS source, f.object_id AS target,
                f.predicate, f.statement, f.expired_at AS expiredAt
         FROM facts f
         WHERE f.object_id IS NOT NULL ${expiredFilter}`,
      )
      .all() as (Omit<GraphLink, "expired"> & { expiredAt: string | null })[];

    const degree = new Map<string, number>();
    for (const link of links) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }
    return {
      nodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 })),
      links: links.map(({ expiredAt, ...link }) => ({ ...link, expired: expiredAt !== null })),
    };
  } finally {
    db.close();
  }
}

function loadStatus(slug: string) {
  const db = openLedger(slug);
  try {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return {
      engagement: slug,
      episodes: count("SELECT count(*) AS n FROM episodes"),
      pending: count("SELECT count(*) AS n FROM episodes WHERE extraction_status = 'pending'"),
      entities: count("SELECT count(*) AS n FROM entities WHERE expired_at IS NULL"),
      activeFacts: count("SELECT count(*) AS n FROM facts WHERE expired_at IS NULL"),
      expiredFacts: count("SELECT count(*) AS n FROM facts WHERE expired_at IS NOT NULL"),
      openTasks: count(
        "SELECT count(*) AS n FROM tasks WHERE status NOT IN ('accepted','rejected')",
      ),
    };
  } finally {
    db.close();
  }
}

function assetsMarkdown(slug: string): string {
  const refs = listAssets(slug);
  const md = [`# Asset library — ${slug}`, ""];
  if (refs.length === 0) {
    md.push("_No assets yet. They accrue from task criteria (rubrics), `openfde demo --save`, evals, and `openfde asset add`._");
    return md.join("\n");
  }
  let currentType = "";
  for (const ref of refs) {
    if (ref.type !== currentType) {
      currentType = ref.type;
      md.push(`## ${currentType}s`, "");
    }
    md.push(`### ${ref.name}`, "", readFileSync(ref.path, "utf8").trim(), "", `<small>${ref.path}</small>`, "");
  }
  return md.join("\n");
}

/** Human-facing projections mirroring the CLI verbs (webui/CLI correspondence) */
function viewMarkdown(slug: string, kind: string): string | null {
  const db = openLedger(slug);
  try {
    switch (kind) {
      case "interview-top":
      case "interview-bottom": {
        const mode: InterviewMode = kind === "interview-top" ? "top-down" : "bottom-up";
        return interviewMarkdown(buildInterviewGuide(db, slug, mode));
      }
      case "datamap":
        return dataMapMarkdown(buildDataMap(db), slug);
      case "flows": {
        const overview = buildOverviewFlow(db);
        return flowsMarkdown([...(overview ? [overview] : []), ...buildFlows(db)], slug);
      }
      case "assets":
        return assetsMarkdown(slug);
      default:
        return null;
    }
  } finally {
    db.close();
  }
}

function search(slug: string, query: string) {
  const db = openLedger(slug);
  try {
    const hits = recall(db, query, { mode: "handoff", limit: 30 });
    const names = new Set<string>();
    for (const hit of hits) {
      names.add(hit.subject);
      if (hit.object) names.add(hit.object);
    }
    const entityIds =
      names.size === 0
        ? []
        : (
            db
              .prepare(
                `SELECT id FROM entities WHERE name IN (${[...names].map(() => "?").join(",")})`,
              )
              .all(...names) as { id: string }[]
          ).map((r) => r.id);
    return { hits, entityIds };
  } finally {
    db.close();
  }
}

/* ---------------- live updates (SSE) ----------------
   CLI and agents write the ledger from other processes; SQLite's
   data_version pragma changes whenever another connection commits,
   so a per-engagement watcher connection polls it and broadcasts. */

interface Watcher {
  db: Ledger;
  version: number;
  clients: Set<ServerResponse>;
  timer: NodeJS.Timeout;
}

const watchers = new Map<string, Watcher>();

function dataVersion(db: Ledger): number {
  return (db.prepare("PRAGMA data_version").get() as { data_version: number }).data_version;
}

function subscribe(slug: string, res: ServerResponse): void {
  let watcher = watchers.get(slug);
  if (!watcher) {
    const db = openLedger(slug);
    watcher = {
      db,
      version: dataVersion(db),
      clients: new Set(),
      timer: setInterval(() => {
        const w = watchers.get(slug);
        if (!w) return;
        const next = dataVersion(w.db);
        if (next !== w.version) {
          w.version = next;
          for (const client of w.clients) client.write(`data: {"type":"update"}\n\n`);
        } else {
          for (const client of w.clients) client.write(`: ping\n\n`);
        }
      }, 1500),
    };
    watcher.timer.unref();
    watchers.set(slug, watcher);
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(`data: {"type":"hello"}\n\n`);
  watcher.clients.add(res);
  res.on("close", () => {
    const w = watchers.get(slug);
    if (!w) return;
    w.clients.delete(res);
    if (w.clients.size === 0) {
      clearInterval(w.timer);
      w.db.close();
      watchers.delete(slug);
    }
  });
}

/* ---------------- server ---------------- */

export interface ShareOptions {
  /** Unguessable URL segment; the share link is /s/<token>/report */
  token: string;
  /** The single engagement this share link exposes */
  engagement: string;
}

export interface ServeOptions {
  port: number;
  /** Defaults to loopback; `openfde share` binds 0.0.0.0 */
  host?: string;
  share?: ShareOptions;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function serve(options: ServeOptions): void {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const host = options.host ?? "127.0.0.1";
  const share = options.share;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${options.port}`);
    const engagementParam = url.searchParams.get("engagement") ?? undefined;
    const isLocal = LOOPBACK.has(req.socket.remoteAddress ?? "");

    try {
      /* ----- share surface: the ONLY routes reachable from other machines ----- */
      if (share && url.pathname.startsWith(`/s/${share.token}/`)) {
        const sub = url.pathname.slice(`/s/${share.token}`.length);
        const base = `/s/${share.token}`;
        switch (sub) {
          case "/report": {
            const db = openLedger(share.engagement);
            try {
              const page = reportPage(buildReport(db, share.engagement), {
                live: true,
                basePath: base,
              });
              res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
              res.end(page);
            } finally {
              db.close();
            }
            return;
          }
          case "/api/report": {
            const db = openLedger(share.engagement);
            try {
              json(res, buildReport(db, share.engagement));
            } finally {
              db.close();
            }
            return;
          }
          case "/api/events": {
            subscribe(share.engagement, res);
            return;
          }
          default:
            json(res, { error: "not found" }, 404);
            return;
        }
      }

      /* ----- workspace surface: loopback only ----- */
      if (!isLocal) {
        json(res, { error: "not found" }, 404);
        return;
      }

      switch (url.pathname) {
        case "/": {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
        case "/report": {
          const slug = resolveEngagement(engagementParam);
          const db = openLedger(slug);
          try {
            const page = reportPage(buildReport(db, slug), { live: true, basePath: "" });
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(page);
          } finally {
            db.close();
          }
          return;
        }
        case "/api/report": {
          const slug = resolveEngagement(engagementParam);
          const db = openLedger(slug);
          try {
            json(res, buildReport(db, slug));
          } finally {
            db.close();
          }
          return;
        }
        case "/api/events": {
          subscribe(resolveEngagement(engagementParam), res);
          return;
        }
        case "/api/engagements": {
          let current: string | null = null;
          try {
            current = resolveEngagement();
          } catch {
            /* none selected */
          }
          json(res, { current, engagements: listEngagements() });
          return;
        }
        case "/api/status": {
          json(res, loadStatus(resolveEngagement(engagementParam)));
          return;
        }
        case "/api/graph": {
          const includeExpired = url.searchParams.get("expired") === "1";
          json(res, loadGraph(resolveEngagement(engagementParam), includeExpired));
          return;
        }
        case "/api/tree": {
          const db = openLedger(resolveEngagement(engagementParam));
          try {
            json(res, loadTree(db));
          } finally {
            db.close();
          }
          return;
        }
        case "/api/note": {
          const id = url.searchParams.get("id");
          const name = url.searchParams.get("name");
          const db = openLedger(resolveEngagement(engagementParam));
          try {
            let noteId = id;
            if (!noteId && name) noteId = resolveEntityByName(db, name);
            if (!noteId) return json(res, { error: "missing id or unknown name" }, 404);
            const markdown = noteId.startsWith("ep_")
              ? episodeNote(db, noteId)
              : noteId.startsWith("task_")
                ? taskNote(db, noteId)
                : entityNote(db, noteId);
            if (markdown === null) return json(res, { error: "not found" }, 404);
            json(res, { id: noteId, markdown });
          } finally {
            db.close();
          }
          return;
        }
        case "/api/view": {
          const kind = url.searchParams.get("kind") ?? "";
          const markdown = viewMarkdown(resolveEngagement(engagementParam), kind);
          if (markdown === null) return json(res, { error: "unknown view" }, 404);
          json(res, { id: `view:${kind}`, markdown });
          return;
        }
        case "/api/tasks": {
          const db = openLedger(resolveEngagement(engagementParam));
          try {
            json(res, { tasks: listTasks(db) });
          } finally {
            db.close();
          }
          return;
        }
        case "/api/task": {
          // mirrors `openfde task <transition>`: same state machine, same audit trail
          if (req.method !== "POST") return json(res, { error: "method not allowed" }, 405);
          const body = await readBody(req);
          const db = openLedger(resolveEngagement(engagementParam));
          try {
            json(res, transitionTask(db, String(body.id ?? ""), String(body.to ?? "") as TaskStatus, {
              actor: process.env.OPENFDE_ACTOR ?? "webui",
              note: body.note ? String(body.note) : undefined,
            }));
          } finally {
            db.close();
          }
          return;
        }
        case "/api/canvas": {
          const eng = resolveEngagement(engagementParam);
          if (req.method === "PUT") {
            const body = await readBody(req);
            json(res, writeCanvas(eng, { cards: (body.cards ?? []) as CanvasData["cards"] }));
            return;
          }
          if (req.method === "POST") {
            const body = await readBody(req);
            json(res, addCanvasCard(eng, String(body.text ?? ""), {
              x: body.x === undefined ? undefined : Number(body.x),
              y: body.y === undefined ? undefined : Number(body.y),
            }));
            return;
          }
          json(res, readCanvas(eng));
          return;
        }
        case "/api/pages": {
          json(res, { pages: listPages(resolveEngagement(engagementParam)) });
          return;
        }
        case "/api/page": {
          const eng = resolveEngagement(engagementParam);
          if (req.method === "POST") {
            const body = await readBody(req);
            json(res, createPage(eng, String(body.title ?? "")));
            return;
          }
          const pageSlug = url.searchParams.get("slug");
          if (!pageSlug) return json(res, { error: "missing slug" }, 404);
          switch (req.method) {
            case "GET":
              json(res, { id: `page:${pageSlug}`, slug: pageSlug, markdown: readPage(eng, pageSlug) });
              return;
            case "PUT": {
              const body = await readBody(req);
              json(res, writePage(eng, pageSlug, String(body.markdown ?? "")));
              return;
            }
            case "DELETE":
              deletePage(eng, pageSlug);
              json(res, { deleted: pageSlug });
              return;
            default:
              json(res, { error: "method not allowed" }, 405);
              return;
          }
        }
        case "/api/search": {
          const q = url.searchParams.get("q")?.trim();
          if (!q) return json(res, { hits: [], entityIds: [] });
          json(res, search(resolveEngagement(engagementParam), q));
          return;
        }
        default:
          json(res, { error: "not found" }, 404);
      }
    } catch (error) {
      json(res, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  server.listen(options.port, host, () => {
    console.log(`openfde workspace: http://localhost:${options.port}`);
    if (share) {
      console.log(`live report (share): /s/${share.token}/report`);
      console.log("Anyone on your network with this link sees the report only — nothing else.");
    } else {
      console.log("Local only (127.0.0.1). Ctrl+C to stop.");
    }
  });
}
