export async function readLimitedJson(
  request: Request,
  maxBytes: number,
): Promise<{ data: unknown; error: null } | { data: null; error: 'too_large' | 'invalid' }> {
  const reader = request.body?.getReader();
  if (!reader) return { data: null, error: 'invalid' };

  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - size) {
        try { await reader.cancel(); } catch { /* The request may already be closed. */ }
        return { data: null, error: 'too_large' };
      }
      size += value.byteLength;
      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), error: null };
  } catch {
    return { data: null, error: 'invalid' };
  } finally {
    reader.releaseLock();
  }
}
