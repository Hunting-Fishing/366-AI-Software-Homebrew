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
