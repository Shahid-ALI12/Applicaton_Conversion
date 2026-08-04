import { useAppStore } from "./store";
import AppSidebar from "./components/layout/sidebar";
import Dashboard from "./components/pages/dashboard";
import DailyEntry from "./components/pages/daily-entry";
import CustomMixOrder from "./components/pages/custom-mix-order";
import DayReconciliation from "./components/pages/day-reconciliation";
import CashManagement from "./components/pages/cash-management";
import CustomerKhata from "./components/pages/customer-khata";
import PurchasesStock from "./components/pages/purchases-stock";
import ManageProducts from "./components/pages/manage-products";
import ManageCustomers from "./components/pages/manage-customers";
import EditCustomer from "./components/pages/edit-customer";
import CustomerAbout from "./components/pages/customer-about";
import LabourKhata from "./components/pages/labour-khata";
import DatabaseManagement from "./components/pages/database-management";
import AdminBlockedUsers from "./components/pages/admin-blocked-users";
import AdminCustomerMgmt from "./components/pages/admin-customer-mgmt";
import { Toaster } from "./components/ui/sonner";

const pageMap: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  "daily-entry": DailyEntry,
  "custom-mix": CustomMixOrder,
  reconciliation: DayReconciliation,
  "cash-mgmt": CashManagement,
  "customer-khata": CustomerKhata,
  "purchases-stock": PurchasesStock,
  "manage-products": ManageProducts,
  "manage-customers": ManageCustomers,
  "edit-customer": EditCustomer,
  "customer-about": CustomerAbout,
  "labour-khata": LabourKhata,
  "database-management": DatabaseManagement,
  "admin-blocked": AdminBlockedUsers,
  "admin-customers": AdminCustomerMgmt,
};

export default function MainLayout() {
  const { activePage } = useAppStore();
  const PageComponent = pageMap[activePage] || Dashboard;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppSidebar />
      <Toaster position="top-right" richColors />
      <main className="lg:ml-64 p-4 sm:p-6 lg:p-8">
        <PageComponent />
      </main>
    </div>
  );
}
