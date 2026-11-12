import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PayPilot AI — Invoices & payments for freelancers" },
      {
        name: "description",
        content: "Create professional invoices, track who owes you, and get paid through PayPal — built for freelancers and small businesses.",
      },
      { property: "og:title", content: "PayPilot AI — Invoices & payments for freelancers" },
      {
        property: "og:description",
        content: "Professional invoices, real payment tracking and AI insights for freelancers and small businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: FileText, title: "Invoices in a minute", body: "Services, quantities, tax and due dates — with a live, print-ready preview." },
  { icon: Wallet, title: "Real payment tracking", body: "See revenue, pending and overdue at a glance. Paid means actually paid." },
  { icon: Sparkles, title: "AI that does the typing", body: "Describe the job in plain words and get a structured invoice back." },
];

function Index() {
  return (
    <div className="min-h-screen bg-hero text-sidebar-foreground">
      <div className="grid-lines pointer-events-none fixed inset-0" aria-hidden="true" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="glass" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-12 lg:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-rise">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 py-1 text-xs font-medium text-sidebar-muted">
              <ShieldCheck className="size-3.5 text-signal" /> Paid only when the money actually lands
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              Invoice smarter.
              <br />
              <span className="text-signal">Get paid sooner.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-sidebar-muted">
              PayPilot AI turns your work into polished invoices, tracks every payment, and tells you exactly who still
              owes you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/auth">
                  Start invoicing free <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="glass" size="lg">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          </div>

          <div className="relative animate-rise [animation-delay:120ms]">
            <div className="rounded-3xl border border-sidebar-border bg-sidebar-accent/40 p-5 shadow-elevated backdrop-blur">
              <div className="grid grid-cols-2 gap-3">
                <MockStat label="Revenue" value="$48,920" accent />
                <MockStat label="Pending" value="$6,140" />
                <MockStat label="Paid invoices" value="64" />
                <MockStat label="Overdue" value="2" danger />
              </div>
              <div className="mt-4 rounded-2xl bg-paper p-5 text-foreground">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold">INV-0042</span>
                  <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">Paid</span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Brand identity package</span>
                    <span className="font-figure">$2,400.00</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Landing page build × 1</span>
                    <span className="font-figure">$1,850.00</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total</span>
                    <span className="font-figure">$4,250.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-24 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-sidebar-border bg-sidebar-accent/30 p-6">
              <f.icon className="size-5 text-signal" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-sidebar-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function MockStat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-sidebar-border bg-sidebar/60 p-4">
      <p className="text-xs text-sidebar-muted">{label}</p>
      <p className={`font-figure mt-1 text-xl font-semibold ${accent ? "text-signal" : danger ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
