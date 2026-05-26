import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/components/main-layout";
import Dashboard from "@/pages/dashboard";
import Login from "@/pages/login";

const Calendar = lazy(() => import("@/pages/calendar"));
const Settings = lazy(() => import("@/pages/settings"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const Diagnostics = lazy(() => import("@/pages/admin/diagnostics"));
const AuditLogs = lazy(() => import("@/pages/admin/audit-logs"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const ChangeCredentials = lazy(() => import("@/pages/change-credentials"));
const Register = lazy(() => import("@/pages/register"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Terms = lazy(() => import("@/pages/terms"));
const Cards = lazy(() => import("@/pages/cards"));
const Notifications = lazy(() => import("@/pages/notifications"));
const Payments = lazy(() => import("@/pages/payments"));
const Budgets = lazy(() => import("@/pages/budgets"));
const Workspaces = lazy(() => import("@/pages/workspaces"));
const AnnualReport = lazy(() => import("@/pages/annual-report"));

export default function App() {
  return (
    <Suspense>
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
    </Suspense>
  );
}
