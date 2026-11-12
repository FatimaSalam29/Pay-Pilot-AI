import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/PageHeader";
import { profileQuery } from "@/lib/data";
import { SUPPORTED_CURRENCIES } from "@/lib/invoice-math";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Business profile — PayPilot AI" },
      { name: "description", content: "The business details printed on your invoices." },
      { property: "og:title", content: "Business profile — PayPilot AI" },
      { property: "og:description", content: "The business details printed on your invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery()),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useSuspenseQuery(profileQuery());
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: profile?.business_name ?? "",
    full_name: profile?.full_name ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    currency: profile?.currency ?? "USD",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setSaving(true);
    const payload = {
      id: auth.user.id,
      business_name: form.business_name.trim() || null,
      full_name: form.full_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      currency: form.currency,
    };
    const { error } = await supabase.from("profiles").upsert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Business profile saved");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Settings" title="Business profile" description="These details appear in the “From” section of every invoice." />
      <Card className="max-w-2xl p-6">
        <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bn">Business name</Label>
            <Input id="bn" value={form.business_name} onChange={set("business_name")} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fn">Your name</Label>
            <Input id="fn" value={form.full_name} onChange={set("full_name")} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">Billing email</Label>
            <Input id="em" type="email" value={form.email} onChange={set("email")} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph">Phone</Label>
            <Input id="ph" value={form.phone} onChange={set("phone")} maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label>Default currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ad">Address</Label>
            <Textarea id="ad" rows={3} value={form.address} onChange={set("address")} maxLength={300} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="hero" disabled={saving}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
