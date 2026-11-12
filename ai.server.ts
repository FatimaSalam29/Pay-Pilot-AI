// Server-only AI helper. Works with any OpenAI-compatible API; defaults to Google Gemini's free tier.
// Env: AI_API_KEY (required). Optional: AI_BASE_URL, AI_MODEL.
type Msg = { role: "user" | "assistant"; content: string };

interface RunOptions {
  instructions: string;
  input: string | Msg[];
  json?: { name: string; schema: Record<string, unknown> };
}

class AiUserError extends Error {}

export async function runModel({ instructions, input, json }: RunOptions): Promise<string> {
  const key = process.env["AI_API_KEY"];
  if (!key) throw new AiUserError("AI is not connected yet. Add AI_API_KEY to enable it.");
  const base = (process.env["AI_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
  const model = process.env["AI_MODEL"] ?? "gemini-2.5-flash";
  const system = json
    ? `${instructions}\nReply with ONLY a JSON object (no markdown, no extra text) that matches this JSON schema:\n${JSON.stringify(json.schema)}`
    : instructions;
  const messages = [{ role: "system", content: system }, ...(typeof input === "string" ? [{ role: "user", content: input }] : input)];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  const started = Date.now();
  try {
    console.log(`AI: calling ${model}`);
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, ...(json ? { response_format: { type: "json_object" } } : {}) }),
      signal: controller.signal,
    });
    console.log(`AI: ${model} answered with status ${res.status} after ${Date.now() - started} ms`);
    if (res.status === 429) throw new AiUserError("The AI is busy right now. Please wait a minute and try again.");
    if (!res.ok) {
      console.error("AI error", res.status, (await res.text()).slice(0, 500));
      throw new AiUserError("The AI service couldn't answer just now. Please try again.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (json) text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!text) throw new AiUserError("The AI returned an empty answer. Please try again.");
    return text;
  } catch (e) {
    if (e instanceof AiUserError) throw e;
    console.error("AI unexpected error:", e);
    throw new AiUserError(
      controller.signal.aborted
        ? "The AI took too long to answer. Please try again."
        : "Could not reach the AI service. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}
