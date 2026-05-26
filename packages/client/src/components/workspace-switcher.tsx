import { Check, ChevronsUpDown } from "lucide-react";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useWorkspace } from "@/contexts/workspace-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces();
  const { currentWorkspaceId, setCurrentWorkspaceId } = useWorkspace();

  const currentWorkspace = workspaces?.find((ws) => ws.id === currentWorkspaceId);

  if (!workspaces || workspaces.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between"
        >
          <span className="truncate">{currentWorkspace?.name ?? "Select workspace"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]" align="start">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => setCurrentWorkspaceId(workspace.id)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                currentWorkspaceId === workspace.id ? "opacity-100" : "opacity-0"
              )}
            />
            {workspace.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
