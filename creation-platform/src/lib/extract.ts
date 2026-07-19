// Pull a clean HTML document out of a model reply.
// Models occasionally wrap code in ```html fences or add a
// sentence before the code, despite instructions not to.

export function extractHtml(text: string): string {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  let code = fence?.[1] ?? text;
  const start = code.indexOf("<!DOCTYPE");
  if (start > 0) code = code.slice(start);
  return code.trim();
}

// Pull a JSON array out of a model reply (used by the shot-list
// engine). Tolerates fences and chatter around the JSON.
export function extractJsonArray(text: string): unknown[] {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fence?.[1] ?? text;
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in the model's reply.");
  }
  const parsed: unknown = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Model reply was not a JSON array.");
  return parsed;
}
