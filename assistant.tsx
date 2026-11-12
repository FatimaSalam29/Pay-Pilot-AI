// AI assistant chat. Save as src/routes/_authenticated/assistant.tsx
import { useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/PageHeader";
import { askAssistant } from "@/lib/ai.functions";
import { todayISO } from "@/lib/invoice-math";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "AI Assistant — PayPilot AI" }] }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = ["Which invoices are overdue?", "Summarise my revenue this month", "Who should I follow up with first?", "List my recent payments"];

function Rich({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { answer } = await ask({ data: { messages: next.slice(-20), today: todayISO() } });
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The assistant is unavailable right now.");
      setMessages(messages);
      setInput(q);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="AI Assistant" description="Ask about your invoices and payments. Answers come only from your real records." />
      <Card className="flex min-h-[26rem] flex-col p-4 sm:p-6">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="py-8 text-center">
              <Sparkles className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Try one of these:</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground" : "max-w-[85%] rounded-2xl border bg-muted/40 px-4 py-2.5"}>
                <Rich text={m.content} />
              </div>
            </div>
          ))}
          {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Reading your records…</p>}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(input); }} className="mt-4 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your invoices or payments" maxLength={4000} />
          <Button type="submit" disabled={busy || !input.trim()}><Send className="size-4" /><span className="sr-only">Send</span></Button>
        </form>
      </Card>
    </div>
  );
}
