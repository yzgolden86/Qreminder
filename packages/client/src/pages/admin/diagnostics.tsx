import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Activity, CheckCircle2, XCircle, Server, Database, HardDrive, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

const diagnosticsSchema = z.object({
  system: z.object({
    version: z.string(),
    runtime: z.string(),
    database: z.string(),
    storage: z.string(),
  }),
  stats: z.object({
    users: z.number(),
    subscriptions: z.number(),
    payments: z.number(),
    budgets: z.number(),
  }),
  cron: z.object({
    lastRun: z.string().nullable(),
    lastStatus: z.string().nullable(),
    recentJobs: z.array(z.object({
      user: z.string(),
      date: z.string(),
      time: z.string(),
      status: z.string(),
      attempts: z.number(),
      lastError: z.string().nullable().optional(),
      updatedAt: z.string(),
    })),
  }),
  recentFailures: z.array(z.object({
    user: z.string(),
    date: z.string(),
    status: z.string(),
    lastError: z.string().nullable().optional(),
    attempts: z.number(),
    updatedAt: z.string(),
  })),
});

export default function Diagnostics() {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => apiFetch("/api/app/admin/diagnostics", diagnosticsSchema),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading diagnostics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="mb-3 h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load diagnostics"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">系统诊断</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">运行状态、数据统计和通知任务概览</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatItem icon={<Server className="h-4 w-4" />} label="运行环境" value={data.system.runtime} />
        <StatItem icon={<Database className="h-4 w-4" />} label="数据库" value={data.system.database} />
        <StatItem icon={<HardDrive className="h-4 w-4" />} label="文件存储" value={data.system.storage} />
        <StatItem icon={<Activity className="h-4 w-4" />} label="版本" value={`v${data.system.version}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <CountCard label="用户" count={data.stats.users} />
        <CountCard label="订阅" count={data.stats.subscriptions} />
        <CountCard label="支付记录" count={data.stats.payments} />
        <CountCard label="预算" count={data.stats.budgets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="surface-card rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">最近 Cron 任务</h3>
          </div>
          {data.cron.recentJobs.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">暂无执行记录</p>
          ) : (
            <div className="grid gap-2">
              {data.cron.recentJobs.map((job, i) => (
                <div key={i} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-[12px]">
                  <span className="text-foreground">{job.date} {job.time}</span>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    job.status === "sent" && "border-success/30 text-success",
                    job.status === "failed" && "border-destructive/30 text-destructive",
                    job.status === "skipped" && "border-muted text-muted-foreground",
                  )}>
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="surface-card rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">最近失败记录</h3>
          </div>
          {data.recentFailures.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>无失败记录</span>
            </div>
          ) : (
            <div className="grid gap-2">
              {data.recentFailures.map((f, i) => (
                <div key={i} className="rounded-md bg-destructive/5 border border-destructive/10 px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">{f.date}</span>
                    <span className="text-muted-foreground">尝试 {f.attempts} 次</span>
                  </div>
                  {f.lastError && (
                    <p className="mt-1 text-[11px] text-destructive truncate">{f.lastError}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface-card rounded-xl p-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-[14px] font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="surface-card rounded-xl p-4 text-center">
      <p className="num-display text-[22px] font-semibold text-foreground">{count}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
