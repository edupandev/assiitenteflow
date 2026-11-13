import * as React from "react";
import { requireUserContext } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUserContext();
  return <AppShell profile={profile}>{children}</AppShell>;
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex items-center justify-center text-xs text-neutral-500">
          Carregando...
        </div>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </React.Suspense>
  );
}
