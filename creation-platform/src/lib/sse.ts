// Minimal Server-Sent-Events reader. All three provider APIs
// stream responses as SSE ("data: {...}" lines). This helper
// turns a fetch Response into an async stream of data payloads.

export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload) yield payload;
      }
    }
  }
}

// Read an error body (providers return JSON errors on non-200).
export async function apiError(name: string, res: Response): Promise<Error> {
  let detail = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    if (data.error?.message) detail = data.error.message;
  } catch {
    /* body wasn't JSON — keep the status code message */
  }
  return new Error(`${name} error: ${detail}`);
}
