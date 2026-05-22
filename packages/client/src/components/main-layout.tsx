import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/sidebar";

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 md:px-8 lg:px-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
