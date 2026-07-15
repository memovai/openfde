import type { ExtractionResult } from "@openfde/ontology";
import type { Extractor, EpisodeInput } from "./extractor.js";

/**
 * Offline/test extractor: matches lines in the marker format
 * "TYPE:name|REL|TYPE:name :: statement".
 * Example: Person:Wang|TRUSTS|DataSource:settlement-db :: Wang only trusts the settlement DB
 */
export class MockExtractor implements Extractor {
  async extract(episode: EpisodeInput): Promise<ExtractionResult> {
    const result: ExtractionResult = { entities: [], facts: [] };
    const seen = new Set<string>();

    const addEntity = (spec: string) => {
      const [type, name] = spec.split(":", 2) as [string, string];
      const key = `${type}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.entities.push({
          type: type as ExtractionResult["entities"][number]["type"],
          name,
          summary: `mock: ${name}`,
        });
      }
      return name;
    };

    for (const line of episode.content.split("\n")) {
      const match = line.match(/^(\S+:[^|]+)\|(\S+)\|(\S+:[^:]+?)\s*::\s*(.+)$/);
      if (!match) continue;
      const [, subjSpec, predicate, objSpec, statement] = match;
      const subject = addEntity(subjSpec!.trim());
      const object = addEntity(objSpec!.trim());
      result.facts.push({
        subject,
        predicate: predicate as ExtractionResult["facts"][number]["predicate"],
        object,
        statement: statement!.trim(),
        quote: line.trim(),
        validFrom: episode.occurredAt ?? null,
      });
    }
    return result;
  }
}
