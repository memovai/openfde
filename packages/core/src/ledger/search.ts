/**
 * FTS5's unicode61 tokenizer treats a whole CJK run as a single token, so
 * substring queries over CJK content never match. Fix: run the exact same
 * per-character segmentation on both the index side and the query side —
 * CJK characters get surrounded by spaces, ASCII words stay intact. On the
 * query side a segmented multi-character term naturally becomes an FTS
 * phrase match.
 */
const CJK = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu;

export function cjkSegment(text: string): string {
  return text.replace(CJK, " $1 ").replace(/\s+/g, " ").trim();
}

/** Query-side only: common words that would OR-match nearly every fact */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "this", "that", "it", "its",
  "as", "at", "by", "from", "into", "over", "up", "down", "we", "our",
]);

/** User query → FTS5 MATCH expression: split on whitespace, strip quotes, drop stopwords, phrase-wrap CJK terms, OR between terms */
export function ftsQuery(query: string): string {
  const all = query
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ""))
    .filter(Boolean);
  const meaningful = all.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  const terms = meaningful.length > 0 ? meaningful : all;
  if (terms.length === 0) return '""';
  return terms.map((t) => `"${cjkSegment(t)}"`).join(" OR ");
}
