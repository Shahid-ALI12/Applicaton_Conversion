import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getToken } from './lib/api';
import { LoginPage } from './pages/Login';
import { LicensePage } from './pages/License';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } });

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/license" element={<LicensePage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPlaceholder /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function DashboardPlaceholder() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: '#1a5632' }}>Danish Cattle Feed Software</h1>
      <p>Dashboard aur baqi pages yahan aayengi. Frontend abhi conversion mein hai.</p>
      <p><a href="/license">License Page</a></p>
    </div>
  );
}
