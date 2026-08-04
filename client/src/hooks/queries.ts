/**
 * React Query hooks for all data fetching.
 * Adapted for REST API via the `api` helper.
 */
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ─── Types ───
interface CashAccount { id: number; name: string; created_at: string; }
interface CashTransfer {
  id: number; transfer_date: string; from_account_id: number; to_account_id: number;
  amount: number; notes: string | null; entered_by: string | null; created_at: string;
  from_account?: CashAccount | null; to_account?: CashAccount | null;
}
interface DashboardMetrics {
  salesTodayCount: number; billedToday: number; cashCollectedToday: number;
  expensesToday: number; totalCustomers: number; totalOutstanding: number;
  overCreditLimitCount: number;
}
interface Reconciliation {
  total_bags_sold: number; total_billed: number; cash_received: number;
  from_credit_customers: number; from_cash_customers: number; total_expenses: number;
  total_cash_in: number; total_cash_out: number; expected_cash_in_hand: number;
  expenses: any[];
}
interface CustomerBalanceInfo {
  opening_balance: number; total_bill: number; total_cash_paid: number;
  total_goods_value: number; balance_due: number;
}

// ─── Query keys ───
export const queryKeys = {
  cashAccounts: ["cash-accounts"] as const,
  cashBalances: ["cash-balances"] as const,
  cashTransfers: (filters: Record<string, string>) => ["cash-transfers", filters] as const,
  dashboard: ["dashboard"] as const,
  reconciliation: (from: string, to: string) => ["reconciliation", from, to] as const,
  customerBalance: (customerId?: number) => ["customer-balance", customerId] as const,
  customers: (activeOnly: boolean) => ["customers", activeOnly] as const,
  customersPaginated: (filters: Record<string, string>, page: number, pageSize: number) =>
    ["customers", "paged", filters, page, pageSize] as const,
  products: (activeOnly: boolean) => ["products", activeOnly] as const,
  suppliers: (activeOnly: boolean) => ["suppliers", activeOnly] as const,
  stock: ["stock"] as const,
  sales: (filters: Record<string, string | number>) => ["sales", filters] as const,
  purchases: (filters: Record<string, string | number>) => ["purchases", filters] as const,
  expenses: (filters: Record<string, string>) => ["expenses", filters] as const,
  mixOrders: ["mix-orders"] as const,
  mixOrdersPaginated: (filters: Record<string, string>, page: number, pageSize: number) =>
    ["mix-orders", "paged", filters, page, pageSize] as const,
  labours: (activeOnly: boolean) => ["labours", activeOnly] as const,
  labourPayments: (filters: Record<string, unknown>) => ["labour-payments", filters] as const,
};

// ─── Cash hooks ───
export function useCashAccounts() {
  return useQuery({
    queryKey: queryKeys.cashAccounts,
    queryFn: () => api.get<CashAccount[]>("/api/cash/accounts"),
    staleTime: 60_000,
  });
}

export function useCashBalances() {
  return useQuery({
    queryKey: queryKeys.cashBalances,
    queryFn: () => api.get<Record<string, number>>("/api/cash/balances"),
    staleTime: 5_000,
  });
}

export function useCashTransfers(filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: queryKeys.cashTransfers(filters),
    queryFn: () => api.get<{ rows: CashTransfer[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/cash/transfer${qs ? "?" + qs : ""}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

// ─── Reports hooks ───
export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardMetrics>("/api/reports/dashboard"),
    staleTime: 5_000,
  });
}

export function useReconciliation(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.reconciliation(from, to),
    queryFn: () => api.get<Reconciliation>(`/api/reports/reconciliation?from=${from}&to=${to}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useCustomerBalance(customerId?: number) {
  return useQuery({
    queryKey: queryKeys.customerBalance(customerId),
    queryFn: () =>
      api.get<CustomerBalanceInfo | Record<number, CustomerBalanceInfo>>(
        customerId
          ? `/api/reports/customer-balance/${customerId}`
          : "/api/reports/customer-balance"
      ),
    staleTime: 10_000,
  });
}

// ─── List hooks ───
export function useCustomers(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.customers(activeOnly),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/customers${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useCustomersPaginated(
  filters: { activeOnly?: boolean; inactiveOnly?: boolean; search?: string } = {},
  page: number,
  pageSize: number,
) {
  const params: Record<string, string> = {};
  if (filters.activeOnly) params.active = "true";
  if (filters.inactiveOnly) params.inactive = "true";
  if (filters.search && filters.search.trim()) params.search = filters.search.trim();
  params.page = String(page);
  params.pageSize = String(pageSize);
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: queryKeys.customersPaginated(params, page, pageSize),
    queryFn: () =>
      api.get<{
        rows: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/customers?${qs}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useProducts(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.products(activeOnly),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/products${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useSuppliers(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.suppliers(activeOnly),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/suppliers${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useStock() {
  return useQuery({
    queryKey: queryKeys.stock,
    queryFn: () => api.get<{ rows: any[]; total: number }>("/api/stock"),
    staleTime: 5_000,
  });
}

export function useSales(filters: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  return useQuery({
    queryKey: queryKeys.sales(filters),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/sales${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useSalesPaginated(
  filters: Record<string, string | number> = {},
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams(filters as Record<string, string>);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return useQuery({
    queryKey: [...queryKeys.sales(filters), "paged", page, pageSize],
    queryFn: () =>
      api.get<{
        rows: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/sales?${qs}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function usePurchases(filters: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  return useQuery({
    queryKey: queryKeys.purchases(filters),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/purchases${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useExpenses(filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/expenses${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useMixOrders() {
  return useQuery({
    queryKey: queryKeys.mixOrders,
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>("/api/mix-orders"),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useMixOrdersPaginated(
  filters: { search?: string; location_id?: number } = {},
  page: number,
  pageSize: number,
) {
  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
  if (filters.search && filters.search.trim()) params.search = filters.search.trim();
  if (filters.location_id != null) params.location_id = String(filters.location_id);
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: queryKeys.mixOrdersPaginated(params, page, pageSize),
    queryFn: () =>
      api.get<{
        rows: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/mix-orders?${qs}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useLabours(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.labours(activeOnly),
    queryFn: () => api.get<{ rows: any[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/labours${activeOnly ? "?active=true" : ""}`),
    staleTime: 60_000,
  });
}

export function useLabourPayments(filters: Record<string, unknown> = {}) {
  const params = new URLSearchParams();
  if (filters.labour_id != null) params.set("labour_id", String(filters.labour_id));
  if (filters.payment_date) params.set("payment_date", String(filters.payment_date));
  if (filters.payment_date_gte) params.set("from", String(filters.payment_date_gte));
  if (filters.payment_date_lte) params.set("to", String(filters.payment_date_lte));
  if (filters.payment_type) params.set("type", String(filters.payment_type));
  if (filters.includeLabour) params.set("include_labour", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.labourPayments(filters),
    queryFn: () => api.get<any[]>(`/api/labours/payments${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

// ─── Invalidation helpers ───
export function useInvalidateAfterMutation() {
  const qc = useQueryClient();
  return {
    invalidateCash: () => {
      qc.invalidateQueries({ queryKey: ["cash-accounts"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
      qc.invalidateQueries({ queryKey: ["cash-transfers"] });
    },
    invalidateDashboard: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
    invalidateCustomerBalance: () => qc.invalidateQueries({ queryKey: ["customer-balance"] }),
    invalidateCustomers: () => qc.invalidateQueries({ queryKey: ["customers"] }),
    invalidateProducts: () => qc.invalidateQueries({ queryKey: ["products"] }),
    invalidateStock: () => qc.invalidateQueries({ queryKey: ["stock"] }),
    invalidateSales: () => qc.invalidateQueries({ queryKey: ["sales"] }),
    invalidatePurchases: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
    invalidateExpenses: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    invalidateReconciliation: () => qc.invalidateQueries({ queryKey: ["reconciliation"] }),
    invalidateMixOrders: () => qc.invalidateQueries({ queryKey: ["mix-orders"] }),
    invalidateLabours: () => qc.invalidateQueries({ queryKey: ["labours"] }),
    invalidateLabourPayments: () => qc.invalidateQueries({ queryKey: ["labour-payments"] }),

    invalidateAfterSaleMutation: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
      qc.invalidateQueries({ queryKey: ["mix-orders"] });
    },
    invalidateAfterPurchaseMutation: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
    invalidateAfterExpenseMutation: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
    invalidateAfterCustomerMutation: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  };
}
