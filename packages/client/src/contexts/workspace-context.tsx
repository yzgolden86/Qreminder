import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useWorkspaces } from "../hooks/use-workspaces";

interface WorkspaceContextValue {
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces } = useWorkspaces();
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // Auto-select personal workspace on mount
  useEffect(() => {
    if (!currentWorkspaceId && workspaces && workspaces.length > 0) {
      const personal = workspaces.find((ws) => ws.name === "Personal");
      setCurrentWorkspaceId(personal?.id ?? workspaces[0]?.id ?? null);
    }
  }, [workspaces, currentWorkspaceId]);

  // Persist selection to localStorage
  useEffect(() => {
    if (currentWorkspaceId) {
      localStorage.setItem("qreminder:currentWorkspaceId", currentWorkspaceId);
    }
  }, [currentWorkspaceId]);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("qreminder:currentWorkspaceId");
    if (stored && workspaces?.some((ws) => ws.id === stored)) {
      setCurrentWorkspaceId(stored);
    }
  }, [workspaces]);

  return (
    <WorkspaceContext.Provider value={{ currentWorkspaceId, setCurrentWorkspaceId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
