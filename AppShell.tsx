import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  Users,
  Settings,
  Sparkles,
  Wallet,
  LogOut,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/invoices", label: "Invoices", icon: FileText, exact: true },
  { to: "/invoices/new", label: "New invoice", icon: FilePlus2, exact: true },
  { to: "/customers", label: "Customers", icon: Users, exact: true },
  { to: "/payments", label: "Payments", icon: Wallet, exact: true },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles, exact: true },
  { to: "/settings", label: "Business profile", icon: Settings, exact: true },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          activeOptions={{ exact: item.exact }}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
        >
          <item.icon className="size-4 shrink-0 transition-colors group-data-[status=active]:text-sidebar-primary" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function UserFooter({ email }: { email: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
      <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
        {initials(email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-sidebar-foreground">{email}</p>
        <p className="text-[11px] text-sidebar-muted">Signed in</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth" });
        }}
        className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between bg-sidebar p-5 lg:flex">
        <div>
          <Link to="/dashboard" className="mb-8 block px-1">
            <Logo />
          </Link>
          <NavList />
        </div>
        <UserFooter email={email} />
      </aside>

      <header className="no-print sticky top-0 z-20 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <Link to="/dashboard">
          <Logo />
        </Link>
        <Button variant="glass" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col justify-between border-sidebar-border bg-sidebar p-5">
          <div>
            <SheetTitle className="mb-8 px-1">
              <Logo />
            </SheetTitle>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
          <UserFooter email={email} />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
