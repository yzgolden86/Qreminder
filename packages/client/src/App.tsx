import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/main-layout";
import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Settings from "@/pages/settings";
import AdminUsers from "@/pages/admin/users";
import Diagnostics from "@/pages/admin/diagnostics";
import AuditLogs from "@/pages/admin/audit-logs";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import ChangeCredentials from "@/pages/change-credentials";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import Cards from "@/pages/cards";
import Notifications from "@/pages/notifications";
import Payments from "@/pages/payments";
import Budgets from "@/pages/budgets";
import Workspaces from "@/pages/workspaces";
import AnnualReport from "@/pages/annual-report";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/annual-report" element={<AnnualReport />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/diagnostics" element={<Diagnostics />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-credentials" element={<ChangeCredentials />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
