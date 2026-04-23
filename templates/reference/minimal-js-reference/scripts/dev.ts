// Dev wrapper that runs `wrangler dev` and ensures only JSON log lines are emitted.
// - Passes PORT env to wrangler's --port
// - Forwards app-emitted JSON logs untouched
// - Filters Wrangler's non-JSON lines; emits a JSON-ready signal when server is ready

const port = process.env.PORT || "8001";

type Level = 30 | 40 | 50;
const emit = (level: Level, msg: string, extra?: Record<string, unknown>) => {
  const entry = { time: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(entry));
};

const proc = Bun.spawn(["wrangler", "dev", "--port", String(port)], {
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, PORT: String(port) },
});

const decoder = new TextDecoder();

async function pipe(stream: ReadableStream<Uint8Array>) {
  let buf = "";
  for await (const chunk of stream) {
    buf += decoder.decode(chunk);
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (!line) continue;

      // Fast path: already JSON
      if (line.startsWith("{")) {
        try {
          JSON.parse(line);
          console.log(line); // forward unchanged
          continue;
        } catch {
          // fall through to filter
        }
      }

      // Transform important wrangler hints to JSON
      if (line.includes("Ready on ")) {
        const m = line.match(/Ready on\s+(http:\/\/[^\s]+)/);
        emit(30, "wrangler.ready", { url: m?.[1] || null, port });
        continue;
      }

      // Drop all other non-JSON lines to keep output parseable by the platform
    }
  }
}

await Promise.all([pipe(proc.stdout), pipe(proc.stderr)]);

const code = await proc.exited;
emit(code === 0 ? 30 : 50, "wrangler.exit", { code });
process.exit(code);

