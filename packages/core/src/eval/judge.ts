import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Eval execution (DESIGN 4.7): scores a piece of work against a rubric
 * asset. The judge is injectable — an LLM in production, a deterministic
 * mock in tests. Verdicts and reasoning flow back into the asset library
 * as eval cases, and into the task's audit trail.
 */

export const Verdict = z.object({
  verdict: z.enum(["pass", "partial", "fail"]),
  score: z.number().min(0).max(100).describe("0-100 against the rubric as a whole"),
  reasoning: z.string().describe("Concise justification, citing rubric criteria by name"),
  criteria: z
    .array(
      z.object({
        criterion: z.string(),
        met: z.boolean(),
        note: z.string(),
      }),
    )
    .describe("Per-criterion breakdown of the rubric"),
});
export type Verdict = z.infer<typeof Verdict>;

export interface Judge {
  judge(rubric: string, work: string): Promise<Verdict>;
}

const SYSTEM = `You are the acceptance judge for a forward deployed engineering team.
Given a rubric (acceptance criteria) and a piece of submitted work, decide whether the work meets the rubric.
Be strict: "pass" only when every material criterion is met. Cite criteria by name in your reasoning.
Judge only what is in front of you; do not assume unstated work exists.`;

export interface AnthropicJudgeOptions {
  model?: string;
  client?: Anthropic;
}

export class AnthropicJudge implements Judge {
  private client: Anthropic;
  private model: string;

  constructor(options: AnthropicJudgeOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? process.env.OPENFDE_MODEL ?? "claude-opus-4-8";
  }

  async judge(rubric: string, work: string): Promise<Verdict> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(Verdict) },
      messages: [
        {
          role: "user",
          content: `<rubric>\n${rubric}\n</rubric>\n<submitted_work>\n${work}\n</submitted_work>`,
        },
      ],
    });
    if (!response.parsed_output) {
      throw new Error(`judge output parse failed (stop_reason=${response.stop_reason})`);
    }
    return response.parsed_output;
  }
}

/** Deterministic judge for tests/offline: passes iff every rubric line appears satisfied by a "DONE:" marker */
export class MockJudge implements Judge {
  async judge(rubric: string, work: string): Promise<Verdict> {
    const criteria = rubric
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean);
    const results = criteria.map((criterion) => ({
      criterion,
      met: work.toLowerCase().includes(criterion.toLowerCase().slice(0, 12)),
      note: "mock check: prefix match against submitted work",
    }));
    const met = results.filter((r) => r.met).length;
    const score = criteria.length === 0 ? 0 : Math.round((met / criteria.length) * 100);
    return {
      verdict: score === 100 ? "pass" : score > 0 ? "partial" : "fail",
      score,
      reasoning: `mock judge: ${met}/${criteria.length} criteria matched`,
      criteria: results,
    };
  }
}

export function verdictMarkdown(verdict: Verdict): string {
  const md = [
    `verdict: **${verdict.verdict}** · score: ${verdict.score}/100`,
    "",
    verdict.reasoning,
    "",
  ];
  for (const c of verdict.criteria) md.push(`- [${c.met ? "x" : " "}] ${c.criterion} — ${c.note}`);
  return md.join("\n");
}
