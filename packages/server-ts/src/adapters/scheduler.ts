export interface SchedulerAdapter {
  kind: "node-cron" | "cf-cron-trigger";
}
