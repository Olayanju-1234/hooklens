"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { auth as authApi, workspaces as workspacesApi, Workspace } from "./api";

interface AuthState {
  token: string | null;
  ingressSlug: string | null;
  isLoading: boolean;
  currentWorkspaceId: string | null;
  workspaceList: Workspace[];
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<string>;
  logout: () => void;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") {
      return {
        token: null,
        ingressSlug: null,
        isLoading: true,
        currentWorkspaceId: null,
        workspaceList: [],
      };
    }
    const token = Cookies.get("token");
    const slug = Cookies.get("ingressSlug");
    const wsId = Cookies.get("workspaceId");
    return {
      token: token || null,
      ingressSlug: slug || null,
      isLoading: false,
      currentWorkspaceId: wsId || null,
      workspaceList: [],
    };
  });

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await workspacesApi.list();
      setState((prev) => {
        const currentValid = list.some(
          (w) => w.id === prev.currentWorkspaceId,
        );
        const wsId =
          currentValid && prev.currentWorkspaceId
            ? prev.currentWorkspaceId
            : list[0]?.id ?? null;
        if (wsId) Cookies.set("workspaceId", wsId, { expires: 30 });
        return { ...prev, workspaceList: list, currentWorkspaceId: wsId };
      });
    } catch {
      // Not logged in or network error
    }
  }, []);

  // Load workspaces on mount if authenticated
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    workspacesApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setState((prev) => {
          const currentValid = list.some(
            (w) => w.id === prev.currentWorkspaceId,
          );
          const wsId =
            currentValid && prev.currentWorkspaceId
              ? prev.currentWorkspaceId
              : list[0]?.id ?? null;
          if (wsId) Cookies.set("workspaceId", wsId, { expires: 30 });
          return { ...prev, workspaceList: list, currentWorkspaceId: wsId };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      Cookies.set("token", res.accessToken, { expires: 7 });
      Cookies.set("ingressSlug", res.ingressSlug, { expires: 7 });
      setState((prev) => ({
        ...prev,
        token: res.accessToken,
        ingressSlug: res.ingressSlug,
        isLoading: false,
      }));
      router.push("/dashboard");
    },
    [router],
  );

  const signup = useCallback(
    async (email: string, password: string): Promise<string> => {
      const res = await authApi.signup(email, password);
      Cookies.set("token", res.accessToken, { expires: 7 });
      Cookies.set("ingressSlug", res.ingressSlug, { expires: 7 });
      setState((prev) => ({
        ...prev,
        token: res.accessToken,
        ingressSlug: res.ingressSlug,
        isLoading: false,
      }));
      return res.ingressSlug;
    },
    [],
  );

  const logout = useCallback(() => {
    Cookies.remove("token");
    Cookies.remove("ingressSlug");
    Cookies.remove("workspaceId");
    setState({
      token: null,
      ingressSlug: null,
      isLoading: false,
      currentWorkspaceId: null,
      workspaceList: [],
    });
    router.push("/login");
  }, [router]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    Cookies.set("workspaceId", workspaceId, { expires: 30 });
    window.location.reload();
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, signup, logout, switchWorkspace, refreshWorkspaces }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
