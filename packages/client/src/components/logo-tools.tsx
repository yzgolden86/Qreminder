/**
 * Logo 库与"从 URL 抓取"工具。
 *
 * 暴露两个按钮，配合 LogoPicker 使用：
 * - LogoFromUrlButton：输入网站 URL，服务器抓取 favicon 并存到 R2
 * - LogoLibraryButton：从用户已上传的资源库中重新选择
 *
 * 抓取成功后调用 onPick(`/api/assets/{id}`)，让外部表单更新 logo 字段。
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Link as LinkIcon, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/i18n/I18nProvider";
import { FaviconResultImage } from "@/components/favicon-result-image";

const fetchResponseSchema = z.object({
  id: z.string(),
  kind: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  originalName: z.string(),
  sourceUrl: z.string().optional(),
});

const libraryResponseSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      originalName: z.string(),
      createdAt: z.string(),
    }),
  ),
});

interface LogoFromUrlButtonProps {
  /** Pre-populated suggestion (e.g., subscription.website). */
  initialUrl?: string;
  onPick: (assetUrl: string) => void;
}

export function LogoFromUrlButton({ initialUrl = "", onPick }: LogoFromUrlButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    if (open) setUrl(initialUrl);
  }, [open, initialUrl]);

  const fetchMutation = useMutation({
    mutationFn: (input: string) =>
      apiFetch("/api/assets/fetch-from-url", fetchResponseSchema, {
        method: "POST",
        body: JSON.stringify({ url: input, kind: "logo" }),
      }),
  });

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      const result = await fetchMutation.mutateAsync(trimmed);
      onPick(`/api/assets/${result.id}`);
      toast.success(t("logoTools.fetchSuccess"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("logoTools.fetchFailed"));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2 border-border">
          <LinkIcon className="w-4 h-4" />
          {t("logoTools.fromUrl")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 border-border bg-card" align="start" sideOffset={8}>
        <div className="grid gap-3">
          <p className="text-[12px] text-muted-foreground">{t("logoTools.fromUrlHelp")}</p>
          <Input
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleFetch()}
            className="border-border bg-secondary"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleFetch}
              disabled={!url.trim() || fetchMutation.isPending}
              className="bg-primary text-primary-foreground"
            >
              {fetchMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t("logoTools.fetch")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface LogoLibraryButtonProps {
  onPick: (assetUrl: string) => void;
}

export function LogoLibraryButton({ onPick }: LogoLibraryButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const libraryQuery = useQuery({
    queryKey: ["assets", "logo"],
    queryFn: () => apiFetch("/api/assets?kind=logo", libraryResponseSchema),
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/assets/${id}`, z.object({ ok: z.boolean() }), { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets", "logo"] });
    },
  });

  const assets = libraryQuery.data?.assets ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2 border-border">
          <FolderOpen className="w-4 h-4" />
          {t("logoTools.library")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 border-border bg-card" align="start" sideOffset={8}>
        <div className="grid gap-3">
          <p className="text-[12px] text-muted-foreground">{t("logoTools.libraryHelp")}</p>
          {libraryQuery.isPending ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : assets.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t("logoTools.libraryEmpty")}</p>
          ) : (
            <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto p-1">
              {assets.map((asset) => (
                <div key={asset.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(`/api/assets/${asset.id}`);
                      setOpen(false);
                    }}
                    title={asset.originalName}
                    className="block h-14 w-14 rounded-lg border-2 border-border bg-white p-1.5 transition-all hover:border-primary hover:bg-primary/10"
                  >
                    <div className="h-full w-full">
                      <FaviconResultImage src={`/api/assets/${asset.id}`} alt={asset.originalName} />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteMutation.mutate(asset.id);
                    }}
                    className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
