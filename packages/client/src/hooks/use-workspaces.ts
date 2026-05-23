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
