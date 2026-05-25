import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  role: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

const workspacesResponseSchema = z.object({ workspaces: z.array(workspaceSchema) });

const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

export type WorkspaceMember = z.infer<typeof memberSchema>;

const membersResponseSchema = z.object({ members: z.array(memberSchema) });
const createResponseSchema = z.object({ id: z.string() });
const okResponseSchema = z.object({ ok: z.boolean() });

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch("/api/workspaces", workspacesResponseSchema),
    select: (data) => data.workspaces,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch("/api/workspaces", createResponseSchema, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/workspaces/${id}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspaces", workspaceId, "members"],
    queryFn: () => apiFetch(`/api/workspaces/${workspaceId}/members`, membersResponseSchema),
    enabled: Boolean(workspaceId),
    select: (data) => data.members,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { workspaceId: string; email: string; role: string }) =>
      apiFetch(`/api/workspaces/${data.workspaceId}/members`, okResponseSchema, {
        method: "POST",
        body: JSON.stringify({ email: data.email, role: data.role }),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ["workspaces", variables.workspaceId, "members"] });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { workspaceId: string; memberId: string }) =>
      apiFetch(`/api/workspaces/${data.workspaceId}/members/${data.memberId}`, okResponseSchema, {
        method: "DELETE",
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ["workspaces", variables.workspaceId, "members"] });
    },
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { workspaceId: string; memberId: string; role: string }) =>
      apiFetch(`/api/workspaces/${data.workspaceId}/members/${data.memberId}`, okResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ role: data.role }),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ["workspaces", variables.workspaceId, "members"] });
    },
  });
}

/**
 * Workspace role hierarchy — kept in sync with the server's `workspace-permissions.ts`.
 * If the server ranking changes, update both files.
 */
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 40,
  admin: 30,
  editor: 20,
  viewer: 10,
};

export function workspaceRoleAtLeast(actual: string | undefined, required: WorkspaceRole): boolean {
  if (!actual) return false;
  const actualRank = ROLE_RANK[actual as WorkspaceRole];
  if (actualRank === undefined) return false;
  return actualRank >= ROLE_RANK[required];
}

/** Resolve the current user's role in a workspace from the cached workspaces list. */
export function useWorkspaceRole(workspaceId: string | undefined): WorkspaceRole | null {
  const { data: workspaces } = useWorkspaces();
  if (!workspaceId || !workspaces) return null;
  const ws = workspaces.find((w) => w.id === workspaceId);
  const role = ws?.role as WorkspaceRole | undefined;
  return role ?? null;
}
