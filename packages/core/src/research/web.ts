import Anthropic from "@anthropic-ai/sdk";

/**
 * Web research for FDEs (goal: help the engineer find methods, not just
 * remember facts). Uses Claude's server-side web search; findings come back
 * as an answer plus the sources that grounded it, ready to be ingested into
 * the engagement memory with provenance.
 */

const SYSTEM = `You are the research assistant of a forward deployed engineer working inside a customer engagement.
The engineer needs actionable methods: how others solved a similar problem, which approach/tool/pattern is proven, what the tradeoffs are.

Rules:
- Search the web before answering; prefer primary sources (docs, engineering blogs, postmortems) over listicles.
- Be concrete: name the method, the conditions under which it works, and the failure modes.
- Structure the answer as: recommended approach(es) -> why -> alternatives considered -> what to verify on-site.
- Keep it under 500 words. Every non-obvious claim needs a source you actually opened.`;

export interface ResearchSource {
  url: string;
  title: string;
}

export interface ResearchResult {
  query: string;
  answer: string;
  sources: ResearchSource[];
}

export interface WebResearcherOptions {
  model?: string;
  client?: Anthropic;
}

export class WebResearcher {
  private client: Anthropic;
  private model: string;

  constructor(options: WebResearcherOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? process.env.OPENFDE_MODEL ?? "claude-opus-4-8";
  }

  async research(query: string, context?: string): Promise<ResearchResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search" } as Anthropic.ToolUnion],
      messages: [
        {
          role: "user",
          content: context
            ? `<engagement_context>\n${context}\n</engagement_context>\n\nQuestion: ${query}`
            : query,
        },
      ],
    });

    const answerParts: string[] = [];
    const sources = new Map<string, ResearchSource>();
    for (const block of response.content) {
      if (block.type === "text") {
        answerParts.push(block.text);
      } else if (block.type === "web_search_tool_result") {
        // success content is a list of results; errors come back as an object
        if (Array.isArray(block.content)) {
          for (const result of block.content) {
            if (result.type === "web_search_result" && !sources.has(result.url)) {
              sources.set(result.url, { url: result.url, title: result.title });
            }
          }
        }
      }
    }
    return {
      query,
      answer: answerParts.join("\n").trim(),
      sources: [...sources.values()],
    };
  }
}

/** Markdown rendering (also the shape saved into memory with --save) */
export function researchMarkdown(result: ResearchResult): string {
  const md = [`# Research: ${result.query}`, "", result.answer, ""];
  if (result.sources.length > 0) {
    md.push("## Sources", "");
    for (const source of result.sources) md.push(`- ${source.title} — ${source.url}`);
  }
  return md.join("\n");
}
