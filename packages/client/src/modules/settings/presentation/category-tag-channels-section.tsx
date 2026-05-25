/**
 * 分类/标签默认通知渠道设置面板。
 *
 * 用户为某分类（例如"娱乐"）或标签（例如"work"）设置默认通知渠道；
 * 该分类/标签下的订阅若没有自己独立的渠道配置，会回退到这里。
 *
 * 解析优先级（在 cron/channel-resolver 中）：
 *   订阅独立渠道 > 标签默认 > 分类默认 > 用户全局 enabledChannels
 *
 * 数据存于 settings JSON 的 categoryDefaultChannels / tagDefaultChannels。
 */
import { useEffect, useState } from "react";
import { Layers2, Plus, Trash2, Tag, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import {
  useCategoryDefaultChannels,
  useSetCategoryDefaultChannels,
  useDeleteCategoryDefaultChannels,
  useTagDefaultChannels,
  useSetTagDefaultChannels,
  useDeleteTagDefaultChannels,
} from "@/hooks/use-notification-strategy";
import { useI18n } from "@/i18n/I18nProvider";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/types/subscription";
import { useCustomConfig } from "@/contexts/CustomConfigContext";

export function CategoryTagChannelsSection() {
  const { t, label: localizeLabel } = useI18n();
  const { config } = useCustomConfig();
  const categoryQuery = useCategoryDefaultChannels();
  const tagQuery = useTagDefaultChannels();
  const categories = categoryQuery.data ?? {};
  const tags = tagQuery.data ?? {};

  const [editing, setEditing] = useState<
    | { mode: "category"; key: string; channels: string[] }
    | { mode: "tag"; key: string; channels: string[] }
    | null
  >(null);
  const [adding, setAdding] = useState<"category" | "tag" | null>(null);

  const setCategory = useSetCategoryDefaultChannels();
  const deleteCategory = useDeleteCategoryDefaultChannels();
  const setTag = useSetTagDefaultChannels();
  const deleteTag = useDeleteTagDefaultChannels();

  const handleSave = async (
    mode: "category" | "tag",
    key: string,
    channels: string[],
  ) => {
    try {
      if (mode === "category") {
        await setCategory.mutateAsync({ category: key, channels });
      } else {
        await setTag.mutateAsync({ tag: key, channels });
      }
      toast.success(t("categoryTagChannels.saved"));
      setEditing(null);
      setAdding(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    }
  };

  const handleDelete = async (mode: "category" | "tag", key: string) => {
    try {
      if (mode === "category") {
        await deleteCategory.mutateAsync(key);
      } else {
        await deleteTag.mutateAsync(key);
      }
      toast.success(t("categoryTagChannels.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    }
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Layers2 className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">
          {t("categoryTagChannels.title")}
        </h2>
      </div>
      <p className="mb-4 text-[12px] text-muted-foreground">
        {t("categoryTagChannels.description")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Category defaults */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <FolderTree className="h-3.5 w-3.5 text-primary" />
              {t("categoryTagChannels.categoryColumn")}
            </div>
            <Button size="sm" variant="outline" onClick={() => setAdding("category")} className="h-7 gap-1 text-[11px]">
              <Plus className="h-3 w-3" />
              {t("categoryTagChannels.add")}
            </Button>
          </div>
          {Object.entries(categories).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t("categoryTagChannels.emptyCategory")}</p>
          ) : (
            <div className="grid gap-1.5">
              {Object.entries(categories).map(([cat, channels]) => {
                const catConfig = config.categories.find((c) => c.value === cat);
                const catLabel = catConfig ? localizeLabel(catConfig.labels) : cat;
                return (
                  <MappingRow
                    key={cat}
                    label={catLabel}
                    channels={channels}
                    onEdit={() => setEditing({ mode: "category", key: cat, channels })}
                    onDelete={() => handleDelete("category", cat)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Tag defaults */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <Tag className="h-3.5 w-3.5 text-primary" />
              {t("categoryTagChannels.tagColumn")}
            </div>
            <Button size="sm" variant="outline" onClick={() => setAdding("tag")} className="h-7 gap-1 text-[11px]">
              <Plus className="h-3 w-3" />
              {t("categoryTagChannels.add")}
            </Button>
          </div>
          {Object.entries(tags).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t("categoryTagChannels.emptyTag")}</p>
          ) : (
            <div className="grid gap-1.5">
              {Object.entries(tags).map(([tag, channels]) => (
                <MappingRow
                  key={tag}
                  label={tag}
                  channels={channels}
                  onEdit={() => setEditing({ mode: "tag", key: tag, channels })}
                  onDelete={() => handleDelete("tag", tag)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <MappingDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        mode={editing?.mode ?? "category"}
        initialKey={editing?.key ?? ""}
        initialChannels={editing?.channels ?? []}
        editingExisting
        onSubmit={(key, channels) =>
          handleSave(editing?.mode ?? "category", key, channels)
        }
      />

      {/* Add dialog */}
      <MappingDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        mode={adding ?? "category"}
        initialKey=""
        initialChannels={[]}
        editingExisting={false}
        existingKeys={
          adding === "category"
            ? Object.keys(categories)
            : adding === "tag"
              ? Object.keys(tags)
              : []
        }
        onSubmit={(key, channels) =>
          handleSave(adding ?? "category", key, channels)
        }
      />
    </section>
  );
}

interface MappingRowProps {
  label: string;
  channels: string[];
  onEdit: () => void;
  onDelete: () => void;
}

function MappingRow({ label, channels, onEdit, onDelete }: MappingRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 px-2.5 py-1.5">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary"
      >
        <span className="truncate text-[12px] font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {channels.length > 0 ? channels.join(", ") : "—"}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive hover:bg-destructive/10"
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface MappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "category" | "tag";
  initialKey: string;
  initialChannels: string[];
  editingExisting: boolean;
  existingKeys?: string[];
  onSubmit: (key: string, channels: string[]) => void | Promise<void>;
}

function MappingDialog({
  open,
  onOpenChange,
  mode,
  initialKey,
  initialChannels,
  editingExisting,
  existingKeys = [],
  onSubmit,
}: MappingDialogProps) {
  const { t } = useI18n();
  const { config } = useCustomConfig();
  const [key, setKey] = useState(initialKey);
  const [selected, setSelected] = useState<string[]>(initialChannels);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setKey(initialKey);
    setSelected(initialChannels);
  }, [initialKey, initialChannels, open]);

  const toggleChannel = (channel: NotificationChannel) => {
    setSelected((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const trimmedKey = key.trim();
  const duplicate = !editingExisting && existingKeys.includes(trimmedKey);
  const valid = trimmedKey.length > 0 && selected.length > 0 && !duplicate;

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmedKey, selected);
    } finally {
      setSubmitting(false);
    }
  };

  // Suggest existing categories/tags from custom config + subscriptions context.
  const categorySuggestions = config.categories?.map((c) => c.value) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "category"
              ? t("categoryTagChannels.dialogCategoryTitle")
              : t("categoryTagChannels.dialogTagTitle")}
          </DialogTitle>
          <DialogDescription>{t("categoryTagChannels.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="mapping-key">
              {mode === "category"
                ? t("categoryTagChannels.categoryColumn")
                : t("categoryTagChannels.tagColumn")}
            </Label>
            <Input
              id="mapping-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={editingExisting}
              list={mode === "category" ? "mapping-category-suggestions" : undefined}
              placeholder={
                mode === "category"
                  ? t("categoryTagChannels.categoryPlaceholder")
                  : t("categoryTagChannels.tagPlaceholder")
              }
              className="border-border bg-secondary"
            />
            {mode === "category" && categorySuggestions.length > 0 && (
              <datalist id="mapping-category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
            {duplicate && (
              <p className="text-[11px] text-destructive">{t("categoryTagChannels.duplicateKey")}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("categoryTagChannels.channels")}</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-secondary/40 p-3">
              {NOTIFICATION_CHANNELS.map((channel) => (
                <label
                  key={channel}
                  className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground"
                >
                  <Checkbox
                    checked={selected.includes(channel)}
                    onCheckedChange={() => toggleChannel(channel)}
                  />
                  {channel}
                </label>
              ))}
            </div>
            {selected.length === 0 && (
              <p className="text-[11px] text-muted-foreground">{t("categoryTagChannels.needChannel")}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
