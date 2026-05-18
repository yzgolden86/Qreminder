import type {
  NotificationHit,
  Subscription,
} from "../schema/index.js";

export interface ReminderMatchInput {
  subscriptions: ReadonlyArray<Subscription>;
  todayLocal: string;
}

function diffDaysISO(target: string, today: string): number {
  const t = Date.UTC(
    Number(target.slice(0, 4)),
    Number(target.slice(5, 7)) - 1,
    Number(target.slice(8, 10)),
  );
  const n = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  return Math.round((t - n) / 86_400_000);
}

export function matchReminderHits({
  subscriptions,
  todayLocal,
}: ReminderMatchInput): NotificationHit[] {
  const hits: NotificationHit[] = [];
  for (const sub of subscriptions) {
    if (sub.status === "cancelled" || sub.status === "paused") continue;
    const renewalDays = diffDaysISO(sub.nextBillingDate, todayLocal);
    if (sub.reminderOffsets.includes(renewalDays)) {
      hits.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        daysUntil: renewalDays,
        matchedOffset: renewalDays,
        kind: "renewal",
      });
    }
    if (sub.trialEndDate) {
      const trialDays = diffDaysISO(sub.trialEndDate, todayLocal);
      if (sub.reminderOffsets.includes(trialDays)) {
        hits.push({
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          daysUntil: trialDays,
          matchedOffset: trialDays,
          kind: "trial",
        });
      }
    }
  }
  return hits;
}
