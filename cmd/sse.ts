type SSEMessage = {
  event: string;
  data: string;
};

type SSEHandler = (message: SSEMessage) => void | Promise<void>;

async function readSSE(response: Response, onMessage: SSEHandler) {
  const body = response.body;
  if (!body) {
    throw new Error("SSE response does not contain a body stream.");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = async () => {
    if (!buffer) return;
    const segments = buffer.split(/\r?\n\r?\n/);
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      if (!segment.trim()) continue;
      await onMessage(parseSegment(segment));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      await flush();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    await flush();
  }

  reader.releaseLock();
}

function parseSegment(segment: string): SSEMessage {
  const lines = segment.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  // console.log(lines);
  for (const line of lines) {
    if (!line.trim() || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || event;
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(6));
      continue;
    }
  }

  return { event, data: dataLines.join("\n") };
}

export type { SSEMessage };
export { readSSE };
