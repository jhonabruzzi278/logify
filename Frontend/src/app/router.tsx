import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "@/app/auth";
import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedPage } from "@/pages/access-denied-page";
import { BillingPage } from "@/pages/billing-page";
import { CalendarPage } from "@/pages/calendar-page";
import { CustomersPage } from "@/pages/customers-page";
import { CustomerDetailPage } from "@/pages/customer-detail-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { InventoryDetailPage } from "@/pages/inventory-detail-page";
import { InventoryPage } from "@/pages/inventory-page";
import { LoginPage } from "@/pages/login-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { OrderDetailPage } from "@/pages/order-detail-page";
import { OrdersPage } from "@/pages/orders-page";
import { PosPage } from "@/pages/pos-page";
import { ProfilePage } from "@/pages/profile-page";
import { PurchasesPage } from "@/pages/purchases-page";
import { ReportsPage } from "@/pages/reports-page";
import { ShipmentsPage } from "@/pages/shipments-page";
import { ShipperDeliveryPage } from "@/pages/shipper-delivery-page";
import { ShipmentDetailPage } from "@/pages/shipment-detail-page";
import { SettingsPage } from "@/pages/settings-page";
import { SuppliersPage } from "@/pages/suppliers-page";
import { TrackingPage } from "@/pages/tracking-page";
import { UsersPage } from "@/pages/users-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />
  },
  {
    path: "/tracking/:code?",
    element: <TrackingPage />
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/inventory", element: <InventoryPage /> },
          { path: "/inventory/:productId", element: <InventoryDetailPage /> },
          { path: "/pos", element: <PosPage /> },
          { path: "/orders", element: <OrdersPage /> },
          { path: "/orders/:orderId", element: <OrderDetailPage /> },
          { path: "/customers", element: <CustomersPage /> },
          { path: "/customers/:customerId", element: <CustomerDetailPage /> },
          { path: "/shipments", element: <ShipmentsPage /> },
          { path: "/shipments/:shipmentId", element: <ShipmentDetailPage /> },
          { path: "/deliveries", element: <ShipperDeliveryPage /> },
          { path: "/deliveries/:shipmentId", element: <ShipmentDetailPage /> },
          { path: "/alerts", element: <Navigate to="/notifications" replace /> },
          { path: "/calendar", element: <CalendarPage /> },
          { path: "/reports", element: <ReportsPage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/users", element: <UsersPage /> },
          { path: "/suppliers", element: <SuppliersPage /> },
          { path: "/purchases", element: <PurchasesPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/billing", element: <BillingPage /> },
          { path: "/access-denied", element: <AccessDeniedPage /> }
        ]
      }
    ]
  }
]);