import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Link2, Mail, RefreshCw, Share2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ShareCard({
  invoiceId,
  token,
  number,
  customerEmail,
  businessName,
  status,
}: {
  invoiceId: string;
  token: string;
  number: string;
  customerEmail: string | null | undefined;
  businessName: string;
  status: string;
}) {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? `${origin}/i/${token}` : "";

  if (status === "draft") {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Link2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Share with your customer</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drafts stay private. Mark this invoice as sent to get a secure link your customer can view and pay.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${number}`, text: `Invoice ${number} from ${businessName}`, url });
      } catch {
        /* user closed the share sheet */
      }
    } else {
      await copy();
    }
  }

  async function resetLink() {
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ share_token: crypto.randomUUID() }).eq("id", invoiceId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New link created — the old link no longer works");
    await queryClient.invalidateQueries({ queryKey: ["invoices", invoiceId] });
  }

  const mailto = `mailto:${customerEmail ?? ""}?subject=${encodeURIComponent(`Invoice ${number} from ${businessName}`)}&body=${encodeURIComponent(
    `Hi,\n\nYou can view${status === "paid" ? "" : " and pay"} invoice ${number} here:\n${url}\n\nThank you!\n${businessName}`,
  )}`;

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">Customer link</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Anyone with this link can view this one invoice{status === "paid" ? "" : " and pay it"}. Nothing else in your account is visible.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <span className="font-figure min-w-0 flex-1 truncate text-xs">{url || "…"}</span>
        <Button size="icon" variant="ghost" className="size-7" aria-label="Copy link" onClick={copy} disabled={!url}>
          <Copy className="size-3.5" />
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={share} disabled={!url}>
          <Share2 /> Share
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={mailto}>
            <Mail /> Email
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={url || "#"} target="_blank" rel="noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button type="button" className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={busy}>
            <RefreshCw className="size-3" /> Reset link
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the customer link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current link stops working immediately. Use this if the link was sent to the wrong person.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current link</AlertDialogCancel>
            <AlertDialogAction onClick={resetLink}>Reset link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
