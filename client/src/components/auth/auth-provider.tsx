import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import React from "react";

interface AuthUser {
  id: number;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.get<AuthUser>("/api/auth/me");
        setUser(data);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
