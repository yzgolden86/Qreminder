import { useState } from "react";
import { Plus, Users, Trash2, UserPlus, UserMinus, Crown, Shield, Pencil, Eye } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  useWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
  useWorkspaceMembers,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
  workspaceRoleAtLeast,
  type Workspace,
} from "@/hooks/use-workspaces";
import { useI18n } from "@/i18n/I18nProvider";

const ROLE_ICON: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
};

const ROLE_OPTIONS = ["admin", "editor", "viewer"] as const;

export default function WorkspacesPage() {
  const { t } = useI18n();
  const workspacesQuery = useWorkspaces();
  const workspaces = workspacesQuery.data ?? [];

  const createWorkspace = useCreateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const result = await createWorkspace.mutateAsync(newName.trim());
      toast.success(t("workspace.createSuccess"));
      setCreateOpen(false);
      setNewName("");
      setActiveId(result.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteWorkspace.mutateAsync(deleteId);
      toast.success(t("workspace.deleteSuccess"));
      if (activeId === deleteId) setActiveId(null);
    } catch {
      toast.error(t("error.generic"));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t("workspace.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("workspace.subtitle")}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
        >
          <Plus className="h-4 w-4" />
          {t("workspace.create")}
        </Button>
      </div>

      {workspacesQuery.isPending ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="mb-1 text-sm font-medium text-foreground">{t("workspace.empty")}</p>
          <p className="mb-4 text-[12px] text-muted-foreground">{t("workspace.emptyHint")}</p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
            <Plus className="h-4 w-4" />
            {t("workspace.create")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="grid gap-2">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("workspace.list")}
            </h2>
            <div className="grid gap-1.5">
              {workspaces.map((ws) => {
                const isActive = activeWorkspace?.id === ws.id;
                const RoleIcon = ROLE_ICON[ws.role ?? "viewer"] ?? Eye;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => setActiveId(ws.id)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/30 hover:bg-secondary/60"
                    }`}
                  >
                    <RoleIcon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-medium ${isActive ? "text-primary" : "text-foreground"}`}>
                        {ws.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{ws.role ?? "—"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {activeWorkspace && (
            <WorkspaceDetailPanel
              workspace={activeWorkspace}
              onDelete={() => setDeleteId(activeWorkspace.id)}
            />
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("workspace.createTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Label htmlFor="ws-name">{t("workspace.nameLabel")}</Label>
            <Input
              id="ws-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("workspace.namePlaceholder")}
              className="border-border bg-secondary"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createWorkspace.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              {createWorkspace.isPending ? t("common.saving") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("workspace.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface WorkspaceDetailPanelProps {
  workspace: Workspace;
  onDelete: () => void;
}

function WorkspaceDetailPanel({ workspace, onDelete }: WorkspaceDetailPanelProps) {
  const { t } = useI18n();
  const membersQuery = useWorkspaceMembers(workspace.id);
  const members = membersQuery.data ?? [];
  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<typeof ROLE_OPTIONS[number]>("editor");
  const [removeId, setRemoveId] = useState<string | null>(null);

  const canManage = workspaceRoleAtLeast(workspace.role, "admin");

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMember.mutateAsync({
        workspaceId: workspace.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success(t("workspace.inviteSuccess"));
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    }
  };

  const handleRemove = async () => {
    if (!removeId) return;
    try {
      await removeMember.mutateAsync({ workspaceId: workspace.id, memberId: removeId });
      toast.success(t("workspace.removeMemberSuccess"));
    } catch {
      toast.error(t("error.generic"));
    } finally {
      setRemoveId(null);
    }
  };

  return (
    <section className="surface-card rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">{workspace.name}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("workspace.yourRole")}: <span className="font-medium text-foreground">{workspace.role ?? "—"}</span>
          </p>
        </div>
        {workspace.role === "owner" && (
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t("common.delete")}
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-foreground">{t("workspace.members")}</h3>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            {t("workspace.invite")}
          </Button>
        )}
      </div>

      {membersQuery.isPending ? (
        <p className="text-[12px] text-muted-foreground">{t("common.loading")}</p>
      ) : members.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t("workspace.noMembers")}</p>
      ) : (
        <div className="grid gap-1.5">
          {members.map((member) => {
            const RoleIcon = ROLE_ICON[member.role] ?? Eye;
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 p-2.5"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                  {(member.name || member.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-foreground">
                    {member.name || member.email}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {canManage && member.role !== "owner" ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) =>
                        updateRole
                          .mutateAsync({ workspaceId: workspace.id, memberId: member.id, role })
                          .then(() => toast.success(t("workspace.roleUpdated")))
                          .catch(() => toast.error(t("error.generic")))
                      }
                    >
                      <SelectTrigger className="h-7 w-[88px] border-border bg-secondary text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("workspace.roleAdmin")}</SelectItem>
                        <SelectItem value="editor">{t("workspace.roleEditor")}</SelectItem>
                        <SelectItem value="viewer">{t("workspace.roleViewer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <RoleIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{member.role}</span>
                    </>
                  )}
                </div>
                {canManage && member.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    onClick={() => setRemoveId(member.id)}
                    aria-label={t("workspace.removeMember")}
                  >
                    <UserMinus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("workspace.inviteTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.inviteDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">{t("workspace.inviteEmail")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="border-border bg-secondary"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("workspace.role")}</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof ROLE_OPTIONS[number])}>
                <SelectTrigger className="border-border bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("workspace.roleAdmin")}</SelectItem>
                  <SelectItem value="editor">{t("workspace.roleEditor")}</SelectItem>
                  <SelectItem value="viewer">{t("workspace.roleViewer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviteMember.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              {inviteMember.isPending ? t("common.saving") : t("workspace.invite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeId !== null} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.removeMember")}</AlertDialogTitle>
            <AlertDialogDescription>{t("workspace.removeMemberConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("workspace.removeMember")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
