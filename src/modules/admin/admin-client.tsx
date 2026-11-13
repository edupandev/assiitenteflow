"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatRelativeTimeBR } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/database";

interface TelegramDeliveryItem {
  id: string;
  delivery_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface BackgroundJobItem {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

interface AdminClientProps {
  currentUserId: string;
  initialEmployees: Profile[];
  deliveries: TelegramDeliveryItem[];
  jobs: BackgroundJobItem[];
}

export function AdminClient({
  currentUserId,
  initialEmployees,
  deliveries,
  jobs,
}: AdminClientProps) {
  const [employees, setEmployees] = React.useState<Profile[]>(initialEmployees);

  async function updateEmployee(
    userId: string,
    patch: { role?: UserRole; is_active?: boolean }
  ) {
    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, ...patch }),
    });
    const json = await res.json();
    if (res.ok && json.employee) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === userId ? (json.employee as Profile) : e))
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Administração
        </h1>
        <p className="text-sm text-neutral-500">
          Gerenciamento de funcionários, fila de processamento e entregas no
          Telegram.
        </p>
      </div>

      {/* Funcionários */}
      <Card>
        <CardHeader>
          <CardTitle>Funcionários ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {emp.full_name}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {emp.email} {emp.job_title ? `• ${emp.job_title}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Select
                  disabled={emp.id === currentUserId}
                  value={emp.role}
                  onChange={(e) =>
                    updateEmployee(emp.id, { role: e.target.value as UserRole })
                  }
                  className="h-8 text-xs w-36"
                >
                  <option value="employee">Funcionário</option>
                  <option value="admin">Administrador</option>
                </Select>

                <button
                  type="button"
                  disabled={emp.id === currentUserId}
                  onClick={() =>
                    updateEmployee(emp.id, { is_active: !emp.is_active })
                  }
                  className="cursor-pointer disabled:opacity-50"
                >
                  <Badge variant={emp.is_active ? "success" : "danger"}>
                    {emp.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entregas Telegram */}
        <Card>
          <CardHeader>
            <CardTitle>Entregas recentes no Telegram</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-neutral-100">
            {deliveries.length === 0 ? (
              <p className="p-5 text-xs text-neutral-500">
                Nenhuma entrega registrada ainda.
              </p>
            ) : (
              deliveries.map((d) => (
                <div
                  key={d.id}
                  className="px-5 py-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-medium text-neutral-900">
                      {d.delivery_type}
                    </span>
                    {d.error_message && (
                      <p className="text-red-600 mt-0.5">{d.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={d.status === "sent" ? "success" : "danger"}
                    >
                      {d.status}
                    </Badge>
                    <span className="text-neutral-400">
                      {formatRelativeTimeBR(d.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Background Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Fila de automações (Cron)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-neutral-100">
            {jobs.length === 0 ? (
              <p className="p-5 text-xs text-neutral-500">
                Nenhum job executado ainda.
              </p>
            ) : (
              jobs.map((j) => (
                <div
                  key={j.id}
                  className="px-5 py-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-medium text-neutral-900">
                      {j.job_type}
                    </span>
                    {j.last_error && (
                      <p className="text-red-600 mt-0.5">{j.last_error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        j.status === "completed"
                          ? "success"
                          : j.status === "failed"
                          ? "danger"
                          : "neutral"
                      }
                    >
                      {j.status}
                    </Badge>
                    <span className="text-neutral-400">
                      {formatRelativeTimeBR(j.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
