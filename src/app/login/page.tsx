"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Lock, Mail, User } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!configured) {
      setError(
        "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local."
      );
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() || email.split("@")[0] },
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        setMessage(
          "Conta criada. Verifique seu e-mail para confirmar o cadastro ou faça login."
        );
        setMode("login");
      }
    } catch {
      setError("Erro inesperado ao autenticar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-10 w-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-sm font-semibold">
            PW
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            PulseWork
          </h1>
          <p className="text-sm text-neutral-500">
            Gestão de projetos, tarefas, ponto e assistente de IA
          </p>
        </div>

        {!configured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <p className="font-medium">Ambiente Supabase não configurado</p>
              <p className="mt-0.5 text-amber-800">
                Copie <code className="font-mono">.env.example</code> para{" "}
                <code className="font-mono">.env.local</code>, execute a migration em{" "}
                <code className="font-mono">supabase/migrations/</code> e reinicie o servidor.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "login" ? "Entrar na plataforma" : "Criar conta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Acesse seu painel individual de produtividade."
                : "O primeiro usuário cadastrado recebe perfil de Administrador."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-700">
                    Nome completo
                  </label>
                  <div className="relative">
                    <User className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
                    <Input
                      type="text"
                      required
                      placeholder="Seu nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700">
                  E-mail corporativo
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
                  <Input
                    type="email"
                    required
                    placeholder="nome@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {message && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {message}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                <span>
                  {loading
                    ? "Processando..."
                    : mode === "login"
                    ? "Entrar"
                    : "Criar conta"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-neutral-100 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                  setMessage(null);
                }}
                className="text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                {mode === "login"
                  ? "Não tem conta? Cadastre-se"
                  : "Já possui conta? Fazer login"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
