"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/types/database";

export function SettingsClient({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = React.useState(profile.full_name);
  const [jobTitle, setJobTitle] = React.useState(profile.job_title ?? "");
  const [maxTokens, setMaxTokens] = React.useState(
    String(profile.ai_preferences?.max_tokens_per_request ?? 1200)
  );
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          job_title: jobTitle.trim() || null,
          max_tokens_per_request: Number(maxTokens) || 1200,
        }),
      });
      if (res.ok) {
        setMessage("Preferências salvas com sucesso.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Configurações
        </h1>
        <p className="text-sm text-neutral-500">
          Preferências da sua conta e limite de tokens do assistente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil e Assistente IA</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Nome completo
              </label>
              <Input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Cargo / Função
              </label>
              <Input
                placeholder="Ex: Desenvolvedor Full-Stack"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Limite máximo de tokens por resposta do Assistente IA
              </label>
              <Input
                type="number"
                min="200"
                max="4000"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>

            {message && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {message}
              </p>
            )}

            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar preferências"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
