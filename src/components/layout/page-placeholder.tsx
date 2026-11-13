import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ModuleScaffoldProps {
  title: string;
  description: string;
  phase: string;
  items: string[];
}

export function ModuleScaffold({
  title,
  description,
  phase,
  items,
}: ModuleScaffoldProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            {title}
          </h1>
          <p className="text-sm text-neutral-500">{description}</p>
        </div>
        <Badge variant="outline">{phase}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escopo planejado do módulo</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-neutral-600">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-neutral-400 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
