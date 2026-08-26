import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "@/app/auth";
import { RequireCompletedOnboarding } from "@/app/onboarding";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoader } from "@/components/common/page-loader";
import { RouteErrorFallback } from "@/components/common/route-error-fallback";

function lazyPage<T extends { [key: string]: ComponentType }>(
  factory: () => Promise<T>,
  named: keyof T
) {
  const LazyComponent = lazy(() => factory().then((module) => ({ default: module[named] })));
  return (
    <Suspense fallback={<PageLoader />}>
      <LazyComponent />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
    errorElement: <RouteErrorFallback />
  },
  {
    path: "/login",
    element: lazyPage(() => import("@/pages/login-page"), "LoginPage"),
    errorElement: <RouteErrorFallback />
  },
  {
    // Groundwork Clerk (ver ADR-004): pagina de prueba separada de /login,
    // sin enlazar desde la navegacion. Ver Frontend/src/pages/login-clerk-page.tsx.
    path: "/login-clerk",
    element: lazyPage(() => import("@/pages/login-clerk-page"), "LoginClerkPage"),
    errorElement: <RouteErrorFallback />
  },
  {
    path: "/forgot-password",
    element: lazyPage(() => import("@/pages/forgot-password-page"), "ForgotPasswordPage"),
    errorElement: <RouteErrorFallback />
  },
  {
    path: "/invite/:token",
    element: lazyPage(() => import("@/pages/invite-page"), "InvitePage"),
    errorElement: <RouteErrorFallback />
  },
  {
    path: "/tracking/:code?",
    element: lazyPage(() => import("@/pages/tracking-page"), "TrackingPage"),
    errorElement: <RouteErrorFallback />
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        path: "/onboarding",
        element: lazyPage(() => import("@/pages/onboarding-page"), "OnboardingPage")
      },
      {
        element: <RequireCompletedOnboarding />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/dashboard", element: lazyPage(() => import("@/pages/dashboard-page"), "DashboardPage") },
              { path: "/inventory", element: lazyPage(() => import("@/pages/inventory-page"), "InventoryPage") },
              { path: "/inventory/:productId", element: lazyPage(() => import("@/pages/inventory-detail-page"), "InventoryDetailPage") },
              { path: "/pos", element: lazyPage(() => import("@/pages/pos-page"), "PosPage") },
              { path: "/orders", element: lazyPage(() => import("@/pages/orders-page"), "OrdersPage") },
              { path: "/orders/:orderId", element: lazyPage(() => import("@/pages/order-detail-page"), "OrderDetailPage") },
              { path: "/customers", element: lazyPage(() => import("@/pages/customers-page"), "CustomersPage") },
              { path: "/customers/:customerId", element: lazyPage(() => import("@/pages/customer-detail-page"), "CustomerDetailPage") },
              { path: "/shipments", element: lazyPage(() => import("@/pages/shipments-page"), "ShipmentsPage") },
              { path: "/shipments/:shipmentId", element: lazyPage(() => import("@/pages/shipment-detail-page"), "ShipmentDetailPage") },
              { path: "/deliveries", element: lazyPage(() => import("@/pages/shipper-delivery-page"), "ShipperDeliveryPage") },
              { path: "/deliveries/:shipmentId", element: lazyPage(() => import("@/pages/shipment-detail-page"), "ShipmentDetailPage") },
              { path: "/alerts", element: <Navigate to="/notifications" replace /> },
              { path: "/calendar", element: lazyPage(() => import("@/pages/calendar-page"), "CalendarPage") },
              { path: "/reports", element: lazyPage(() => import("@/pages/reports-page"), "ReportsPage") },
              { path: "/notifications", element: lazyPage(() => import("@/pages/notifications-page"), "NotificationsPage") },
              { path: "/profile", element: lazyPage(() => import("@/pages/profile-page"), "ProfilePage") },
              { path: "/users", element: lazyPage(() => import("@/pages/users-page"), "UsersPage") },
              { path: "/suppliers", element: lazyPage(() => import("@/pages/suppliers-page"), "SuppliersPage") },
              { path: "/purchases", element: lazyPage(() => import("@/pages/purchases-page"), "PurchasesPage") },
              { path: "/settings", element: lazyPage(() => import("@/pages/settings-page"), "SettingsPage") },
              { path: "/billing", element: lazyPage(() => import("@/pages/billing-page"), "BillingPage") },
              { path: "/access-denied", element: lazyPage(() => import("@/pages/access-denied-page"), "AccessDeniedPage") }
            ]
          }
        ]
      }
    ]
  },
  {
    path: "*",
    element: lazyPage(() => import("@/pages/not-found-page"), "NotFoundPage"),
    errorElement: <RouteErrorFallback />
  }
]);
