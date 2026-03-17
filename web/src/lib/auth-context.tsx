"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { auth as authApi } from "./api";

interface AuthState {
  token: string | null;
  ingressSlug: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<string>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") {
      return { token: null, ingressSlug: null, isLoading: true };
    }
    const token = Cookies.get("token");
    const slug = Cookies.get("ingressSlug");
    return {
      token: token || null,
      ingressSlug: slug || null,
      isLoading: false,
    };
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      Cookies.set("token", res.accessToken, { expires: 7 });
      Cookies.set("ingressSlug", res.ingressSlug, { expires: 7 });
      setState({
        token: res.accessToken,
        ingressSlug: res.ingressSlug,
        isLoading: false,
      });
      router.push("/dashboard");
    },
    [router],
  );

  const signup = useCallback(
    async (email: string, password: string): Promise<string> => {
      const res = await authApi.signup(email, password);
      Cookies.set("token", res.accessToken, { expires: 7 });
      Cookies.set("ingressSlug", res.ingressSlug, { expires: 7 });
      setState({
        token: res.accessToken,
        ingressSlug: res.ingressSlug,
        isLoading: false,
      });
      return res.ingressSlug;
    },
    [],
  );

  const logout = useCallback(() => {
    Cookies.remove("token");
    Cookies.remove("ingressSlug");
    setState({ token: null, ingressSlug: null, isLoading: false });
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
