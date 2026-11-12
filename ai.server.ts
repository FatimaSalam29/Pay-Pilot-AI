
// Server-only AI helper.
// Works with Groq and other OpenAI-compatible APIs.
// Env: AI_API_KEY (required). AI_BASE_URL and AI_MODEL are optional.

type Msg = {
  role: "user" | "assistant";
  content: string;
};

interface RunOptions {
  instructions: string;
  input: string | Msg[];
  json?: {
    name: string;
    schema: Record<string, unknown>;
  };
}

class AiUserError extends Error {}

export async function runModel({
  instructions,
  input,
  json,
}: RunOptions): Promise<string> {
  const key = process.env["AI_API_KEY"]?.trim();

  if (!key) {
    throw new AiUserError(
      "AI is not connected. Please configure AI_API_KEY."
    );
  }

  const base = (
    process.env["AI_BASE_URL"] ??
    "https://api.groq.com/openai/v1"
  )
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");

  const model = (
    process.env["AI_MODEL"] ??
    "llama-3.3-70b-versatile"
  )
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(AI_MODEL|ai_model)\s*=\s*/i, "");

  if (!model) {
    throw new AiUserError("AI_MODEL is not configured correctly.");
  }

  const system = json
    ? `${instructions}\nReply with ONLY a valid JSON object (no markdown or extra text) matching this schema:\n${JSON.stringify(json.schema)}`
    : instructions;

  const messages = [
    { role: "system" as const, content: system },
    ...(typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : input),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const started = Date.now();

  try {
    console.log(`AI: calling ${model}`);

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    console.log(
      `AI: response status ${res.status} after ${Date.now() - started}ms`
    );

    if (res.status === 429) {
      throw new AiUserError(
        "AI request limit reached. Please wait and try again."
      );
    }

    if (res.status === 401 || res.status === 403) {
      console.error("AI authentication failed.");
      throw new AiUserError(
        "AI authentication failed. Please check your API key."
      );
    }

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("AI provider error:", res.status, errorBody.slice(0, 1000));

      throw new AiUserError(
        "AI service error. Please check your AI model and configuration."
      );
    }

    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string;
        };
      }[];
    };

    let result = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (json) {
      result = result
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }

    if (!result) {
      throw new AiUserError("AI returned an empty response. Please try again.");
    }

    return result;
  } catch (error) {
    if (error instanceof AiUserError) {
      throw error;
    }

    console.error("AI unexpected error:", error);

    throw new AiUserError(
      controller.signal.aborted
        ? "AI request timed out. Please try again."
        : "Could not connect to AI service. Check your connection and configuration."
    );
  } finally {
    clearTimeout(timer);
  }
}
