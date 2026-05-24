import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ScrollText } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/i18n/I18nProvider";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const auditLogSchema = z.object({
  id: z.string(),
  user: z.string(),
  workspace: z.string().nullable().optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  payload: z.unknown().optional(),
  createdAt: z.string(),
});

type AuditLog = z.infer<typeof auditLogSchema>;

const auditLogsResponseSchema = z.object({
  logs: z.array(auditLogSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const PAGE_SIZE = 50;

function useAuditLogs(offset: number) {
  return useQuery({
    queryKey: ["audit-logs", offset],
    queryFn: () =>
      apiFetch(
        `/api/app/admin/audit-logs?limit=${PAGE_SIZE}&offset=${offset}`,
        auditLogsResponseSchema,
      ),
  });
}

export default function AuditLogsPage() {
  const { t, formatDateTime } = useI18n();
  const [offset, setOffset] = useState(0);
  const query = useAuditLogs(offset);
  const data = query.data;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {t("auditLog.title")}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("auditLog.subtitle")}</p>
      </div>

      {query.isPending ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : query.isError ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : t("error.generic")}
        </div>
      ) : !data || data.logs.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <ScrollText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">{t("auditLog.empty")}</p>
        </div>
      ) : (
        <>
          <div className="surface-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-[12px] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">{t("auditLog.time")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("auditLog.user")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("auditLog.action")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("auditLog.target")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("auditLog.summary")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-foreground">
                        {log.user.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {log.action}
                        </code>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{log.targetType}</span>
                        {log.targetId && (
                          <span className="ml-1 text-muted-foreground">/{log.targetId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground max-w-[400px] truncate">
                        {log.summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground">
              {t("auditLog.pageInfo", {
                from: offset + 1,
                to: Math.min(offset + data.logs.length, data.total),
                total: data.total,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + data.logs.length >= data.total}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
