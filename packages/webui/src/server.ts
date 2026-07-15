import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import {
  buildReport,
  entityNote,
  episodeNote,
  listEngagements,
  loadTree,
  openLedger,
  recall,
  resolveEngagement,
  resolveEntityByName,
  taskNote,
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
      .prepare(
        `SELECT id, type, name, summary, trust FROM entities WHERE expired_at IS NULL`,
      )
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

function loadEntity(slug: string, entityId: string) {
  const db = openLedger(slug);
  try {
    const entity = db
      .prepare(`SELECT id, type, name, summary, trust FROM entities WHERE id = ?`)
      .get(entityId);
    if (!entity) return null;
    const facts = db
      .prepare(
        `SELECT f.id AS factId, f.statement, f.predicate, f.quote,
                f.valid_from AS validFrom, f.expired_at AS expiredAt, f.invalidated_by AS invalidatedBy,
                s.name AS subject, o.name AS object,
                e.source_uri AS sourceUri, e.speaker, e.occurred_at AS occurredAt
         FROM facts f
         JOIN entities s ON s.id = f.subject_id
         LEFT JOIN entities o ON o.id = f.object_id
         JOIN episodes e ON e.id = f.episode_id
         WHERE f.subject_id = ? OR f.object_id = ?
         ORDER BY f.expired_at IS NOT NULL, f.created_at DESC`,
      )
      .all(entityId, entityId);
    return { entity, facts };
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
        : (db
            .prepare(
              `SELECT id FROM entities WHERE name IN (${[...names].map(() => "?").join(",")})`,
            )
            .all(...names) as { id: string }[]).map((r) => r.id);
    return { hits, entityIds };
  } finally {
    db.close();
  }
}

export interface ServeOptions {
  port: number;
}

export function serve(options: ServeOptions): void {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${options.port}`);
    const engagementParam = url.searchParams.get("engagement") ?? undefined;

    try {
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
            const html = reportPage(buildReport(db, slug));
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(html);
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
        case "/api/entity": {
          const id = url.searchParams.get("id");
          if (!id) return json(res, { error: "missing id" }, 400);
          const detail = loadEntity(resolveEngagement(engagementParam), id);
          if (!detail) return json(res, { error: "not found" }, 404);
          json(res, detail);
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

  server.listen(options.port, "127.0.0.1", () => {
    console.log(`openfde graph UI: http://localhost:${options.port}`);
    console.log("Local only (127.0.0.1). Ctrl+C to stop.");
  });
}
