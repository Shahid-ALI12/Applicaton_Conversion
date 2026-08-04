
/**
 * React Query provider — wraps the entire app.
 *
 * Why: enables client-side data caching with smart invalidation.
 * - Page navigation back/forward: instant (data already in memory)
 * - Tab switching: instant
 * - Background refetch keeps data fresh (staleTime controls this)
 *
 * Safety:
 * - If React Query fails for any reason, useQuery falls back to its own retry logic.
 * - Hooks built on top (src/hooks/queries.ts) wrap useQuery with conservative defaults.
 */
import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";
import type { ReactNode } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30s — during this window, no refetch on focus/navigation
        staleTime: 30_000,
        // Keep cached data for 5 minutes even if unused (for back-navigation)
        gcTime: 5 * 60 * 1000,
        // Retry failed queries once (default is 4 — too aggressive for our use case)
        retry: 1,
        // Don't refetch on window focus by default — financial data shouldn't change unexpectedly
        refetchOnWindowFocus: false,
        // Refetch on reconnect (user came back online) — ensures fresh data after network drop
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse client across renders (singleton per browser session)
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const client = getQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
