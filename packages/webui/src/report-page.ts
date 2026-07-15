import type { Evidence, ReportData } from "@openfde/core";

export interface ReportPageOptions {
  /** Wire up SSE auto-refresh (LIVE badge, progress feed updates) */
  live?: boolean;
  /** "" for the local workspace, "/s/<token>" for share links */
  basePath?: string;
}

/**
 * The boss-facing page (DESIGN 4.10): light, calm, printable. Deliberately
 * not the engineer UI — this is what an FDE puts on a projector or exports
 * to PDF at the end of the interview phase.
 */

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function evidenceHtml(evidence: Evidence[], max = 3): string {
  return evidence
    .slice(0, max)
    .map(
      (e) => `
      <div class="evidence">
        <div class="stmt">${esc(e.statement)}</div>
        ${e.quote ? `<blockquote>“${esc(e.quote)}”</blockquote>` : ""}
        <div class="src">${esc(e.sourceUri)}${e.speaker ? ` — ${esc(e.speaker)}` : ""}</div>
      </div>`,
    )
    .join("");
}

export function reportPage(report: ReportData, opts: ReportPageOptions = {}): string {
  const c = report.coverage;
  const pipeline = Object.entries(report.tasks.byStatus)
    .map(([s, n]) => `<span class="pill">${n} ${esc(s)}</span>`)
    .join(" ");

  const painSection =
    report.painPoints.length === 0
      ? `<p class="empty">No opportunities recorded yet — ingest interview material first.</p>`
      : report.painPoints
          .map(
            (p) => `
        <div class="card">
          <div class="card-head">
            <h3>${esc(p.name)}</h3>
            ${p.quantified ? `<span class="tag ok">quantified</span>` : `<span class="tag warn">needs numbers</span>`}
          </div>
          ${p.reporters.length ? `<div class="who">reported by ${esc(p.reporters.join(", "))}</div>` : ""}
          ${evidenceHtml(p.evidence)}
        </div>`,
          )
          .join("");

  const autoSection =
    report.automations.length === 0 && report.tasks.delivered.length === 0
      ? `<p class="empty">No automation coverage recorded yet.</p>`
      : report.automations
          .map(
            (a) => `
        <div class="card">
          <div class="card-head"><h3>${esc(a.step)}</h3><span class="tag ok">automated</span></div>
          <div class="who">covered by <code>${esc(a.asset)}</code></div>
          ${evidenceHtml(a.evidence, 1)}
        </div>`,
          )
          .join("") +
        (report.tasks.delivered.length
          ? `<div class="card"><div class="card-head"><h3>Delivered &amp; accepted</h3></div><ul class="plain">${report.tasks.delivered
              .map((t) => `<li>${esc(t.title)}${t.outcome ? `<div class="who">outcome: ${esc(t.outcome)}</div>` : ""}</li>`)
              .join("")}</ul></div>`
          : "");

  const questions =
    report.quantifyQuestions.length === 0
      ? report.painPoints.length > 0
        ? `<p>All recorded opportunities carry quantitative evidence.</p>`
        : ""
      : `<p>To turn this into a hard number, we need answers to:</p>
         <ul>${report.quantifyQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`;

  const activity =
    report.activity.length === 0
      ? ""
      : `<div class="card"><div class="card-head"><h3>Live progress</h3></div>
         <ul class="plain feed">${report.activity
           .map((a) => {
             const what =
               a.kind === "status"
                 ? `<code>${esc(a.fromStatus)}</code> → <code>${esc(a.toStatus)}</code>`
                 : a.kind === "created"
                   ? "created"
                   : "note";
             return `<li><span class="t">${esc(a.at.slice(5, 16).replace("T", " "))}</span>
               <strong>${esc(a.taskTitle)}</strong> · ${what}${a.actor ? ` <span class="who-inline">by ${esc(a.actor)}</span>` : ""}${a.note ? `<div class="who">${esc(a.note)}</div>` : ""}</li>`;
           })
           .join("")}</ul></div>`;

  const liveScript = !opts.live
    ? ""
    : `<script>
(function () {
  var base = ${JSON.stringify(opts.basePath ?? "")};
  var engagement = ${JSON.stringify(report.engagement)};
  var es = new EventSource(base + "/api/events?engagement=" + encodeURIComponent(engagement));
  var badge = document.getElementById("live-badge");
  var stamp = document.getElementById("live-stamp");
  es.onopen = function () { if (badge) badge.classList.add("on"); };
  es.onerror = function () { if (badge) badge.classList.remove("on"); };
  es.onmessage = function (ev) {
    var msg = {};
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type !== "update") return;
    fetch(location.href, { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var next = doc.querySelector("main");
        var current = document.querySelector("main");
        if (next && current) {
          var y = window.scrollY;
          current.replaceWith(next);
          window.scrollTo(0, y);
          if (stamp) stamp.textContent = "updated " + new Date().toLocaleTimeString();
        }
      });
  };
})();
</script>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Engagement report — ${esc(report.engagement)}</title>
<style>
  :root {
    --ink: #1c1c1e; --muted: #6b6b70; --faint: #9a9aa0;
    --line: #e6e4df; --paper: #faf9f7; --card: #ffffff;
    --accent: #5b4bc4; --ok: #1f7a4d; --warn: #b45309;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
      "Hiragino Sans", "Noto Sans CJK SC", sans-serif;
    background: var(--paper); color: var(--ink);
    line-height: 1.6; font-size: 15px;
  }
  main { max-width: 860px; margin: 0 auto; padding: 56px 40px 80px; }
  header.rpt { border-bottom: 2px solid var(--ink); padding-bottom: 18px; margin-bottom: 8px; }
  header.rpt h1 { font-size: 30px; letter-spacing: -0.01em; }
  header.rpt .sub { color: var(--muted); margin-top: 6px; }
  .stats { display: flex; gap: 28px; flex-wrap: wrap; margin: 22px 0 8px; }
  .stat .num { font-size: 26px; font-weight: 700; }
  .stat .lbl { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  section { margin-top: 40px; }
  section > h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--accent); margin-bottom: 4px;
  }
  section > .q { font-size: 21px; font-weight: 700; margin-bottom: 16px; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px 18px; margin-bottom: 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    break-inside: avoid;
  }
  .card-head { display: flex; align-items: center; gap: 10px; }
  .card-head h3 { font-size: 16px; flex: 1; }
  .tag {
    font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .tag.ok { color: var(--ok); background: rgba(31,122,77,0.1); }
  .tag.warn { color: var(--warn); background: rgba(180,83,9,0.1); }
  .who { color: var(--muted); font-size: 13px; margin: 4px 0 6px; }
  .evidence { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
  .evidence .stmt { font-size: 14px; }
  .evidence blockquote {
    margin: 6px 0; padding: 6px 12px; border-left: 3px solid var(--accent);
    background: rgba(91,75,196,0.05); color: var(--muted); font-size: 13px;
    border-radius: 0 6px 6px 0;
  }
  .evidence .src { font-size: 11.5px; color: var(--faint); word-break: break-all; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;
    background: rgba(91,75,196,0.08); padding: 1px 6px; border-radius: 4px;
  }
  .pill {
    display: inline-block; border: 1px solid var(--line); background: var(--card);
    border-radius: 999px; padding: 3px 12px; font-size: 13px; margin: 2px 4px 2px 0;
  }
  ul { margin: 8px 0 8px 22px; }
  ul.plain { list-style: none; margin-left: 2px; }
  ul.plain li { padding: 3px 0; }
  .empty { color: var(--faint); font-style: italic; }
  footer.rpt {
    margin-top: 56px; padding-top: 14px; border-top: 1px solid var(--line);
    color: var(--faint); font-size: 12px;
  }
  #print-btn {
    position: fixed; top: 18px; right: 18px;
    background: var(--accent); color: white; border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 8px rgba(91,75,196,0.3);
  }
  .live { color: var(--faint); font-weight: 700; font-size: 12px; letter-spacing: 0.04em; }
  .live .dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: var(--faint); margin-right: 5px; vertical-align: 1px;
  }
  .live.on { color: var(--ok); }
  .live.on .dot { background: var(--ok); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  #live-stamp { font-size: 12px; color: var(--faint); }
  .feed li { border-bottom: 1px dashed var(--line); padding: 6px 0; }
  .feed li:last-child { border-bottom: none; }
  .feed .t { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--faint); margin-right: 8px; }
  .who-inline { color: var(--muted); font-size: 12px; }
  @media print {
    #print-btn { display: none; }
    body { background: white; }
    main { padding: 0; max-width: none; }
    .card { box-shadow: none; }
  }
</style>
</head>
<body>
<button id="print-btn" onclick="window.print()">Print / PDF</button>
<main>
  <header class="rpt">
    <h1>Engagement report</h1>
    <div class="sub">${esc(report.engagement)} · generated ${esc(report.generatedAt.slice(0, 10))} · every claim cites its source${
      opts.live
        ? ` · <span id="live-badge" class="live"><span class="dot"></span>LIVE</span> <span id="live-stamp"></span>`
        : ""
    }</div>
    <div class="stats">
      <div class="stat"><div class="num">${c.episodes}</div><div class="lbl">sessions</div></div>
      <div class="stat"><div class="num">${c.activeFacts}</div><div class="lbl">verified facts</div></div>
      <div class="stat"><div class="num">${report.painPoints.length}</div><div class="lbl">opportunities</div></div>
      <div class="stat"><div class="num">${report.automations.length + report.tasks.delivered.length}</div><div class="lbl">automated</div></div>
    </div>
    ${c.speakers.length ? `<div class="who">interviews with ${esc(c.speakers.join(", "))}</div>` : ""}
  </header>

  <section>
    <h2>Question 1</h2>
    <div class="q">What can we take off your team's plate?</div>
    ${painSection}
  </section>

  <section>
    <h2>Question 2</h2>
    <div class="q">How much load does that remove?</div>
    ${
      report.painPoints.filter((p) => p.quantified).length > 0
        ? report.painPoints
            .filter((p) => p.quantified)
            .map((p) => `<div class="card"><div class="card-head"><h3>${esc(p.name)}</h3></div>${evidenceHtml(p.evidence, 2)}</div>`)
            .join("")
        : `<p class="empty">No quantified evidence yet.</p>`
    }
    ${
      report.painPoints.some((p) => !p.quantified)
        ? `<p class="who">${report.painPoints.filter((p) => !p.quantified).length} opportunity(ies) still need numbers — see question 4.</p>`
        : ""
    }
  </section>

  <section>
    <h2>Question 3</h2>
    <div class="q">What gets replaced?</div>
    ${autoSection}
  </section>

  <section>
    <h2>Question 4</h2>
    <div class="q">What is it worth, and what happens next?</div>
    <div class="card">
      <div class="card-head"><h3>Task pipeline</h3></div>
      <div style="margin-top:8px">${pipeline || '<span class="empty">empty</span>'}</div>
    </div>
    ${activity}
    ${
      report.constraints.length
        ? `<div class="card"><div class="card-head"><h3>Constraints we will respect</h3></div><ul class="plain">${report.constraints
            .map((k) => `<li>${esc(k.statement)} <span class="evidence src" style="display:inline">(${esc(k.sourceUri)})</span></li>`)
            .join("")}</ul></div>`
        : ""
    }
    ${questions ? `<div class="card"><div class="card-head"><h3>Quantification questions for the next session</h3></div>${questions}</div>` : ""}
  </section>

  <footer class="rpt">
    Generated by openfde from the engagement memory. Numbers are only claimed where sources contain them; superseded facts are excluded.
  </footer>
</main>
${liveScript}
</body>
</html>`;
}
