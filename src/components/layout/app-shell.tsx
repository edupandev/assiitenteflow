"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Bot,
  CheckSquare,
  Clock,
  Timer,
  FileBarChart2,
  Blocks,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projetos", href: "/projetos", icon: FolderKanban },
  { label: "Assistente IA", href: "/assistente", icon: Bot },
  { label: "Tarefas", href: "/tarefas", icon: CheckSquare },
  { label: "Controle de ponto", href: "/ponto", icon: Clock },
  { label: "Horas extras", href: "/horas-extras", icon: Timer },
  { label: "Relatórios", href: "/relatorios", icon: FileBarChart2 },
  { label: "Integrações", href: "/integracoes", icon: Blocks },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
  {
    label: "Administração",
    href: "/admin",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

interface AppShellProps {
  profile: Profile;
  children: React.ReactNode;
}

export function AppShell({ profile, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || profile.role === "admin"
  );

  async function handleSignOut() {
    if (!isSupabaseConfigured()) {
      router.push("/login");
      return;
    }
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const initials = profile.full_name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r border-neutral-200/80 bg-white">
        <div className="flex h-14 items-center gap-2.5 px-5 border-b border-neutral-100">
          <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-xs font-semibold tracking-tight">
            PW
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-neutral-900 truncate">
              PulseWork
            </p>
            <p className="text-[11px] text-neutral-500 truncate">
              Gestão Inteligente
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-neutral-100 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-700 shrink-0">
              {initials || "US"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-neutral-900 truncate">
                {profile.full_name}
              </p>
              <p className="text-[11px] text-neutral-500 truncate">
                {profile.role === "admin" ? "Administrador" : "Funcionário"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sair"
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200/80 bg-white/95 backdrop-blur px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-xs font-semibold">
            PW
          </div>
          <span className="text-sm font-semibold text-neutral-900">
            PulseWork
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-black/30"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full bg-white border-r border-neutral-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between px-4 border-b border-neutral-100">
              <span className="text-sm font-semibold text-neutral-900">
                Navegação
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-700 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-neutral-100 p-3">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:pl-60 pb-20 md:pb-8">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* Mobile Quick Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur grid grid-cols-5 h-14">
        {[
          { label: "Início", href: "/dashboard", icon: LayoutDashboard },
          { label: "Tarefas", href: "/tarefas", icon: CheckSquare },
          { label: "Projetos", href: "/projetos", icon: FolderKanban },
          { label: "Ponto", href: "/ponto", icon: Clock },
          { label: "IA", href: "/assistente", icon: Bot },
        ].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-neutral-900" : "text-neutral-500"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
