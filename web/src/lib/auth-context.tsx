"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
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
  login: (email: string, password: string, next?: string | null) => Promise<void>;
  signup: (email: string, password: string) => Promise<string>;
  setSession: (token: string, ingressSlug: string) => Promise<void>;
  replaceToken: (token: string) => void;
  logout: () => void;
  switchWorkspace: (workspaceId: string, redirectTo?: string) => void;
  refreshWorkspaces: () => Promise<Workspace[]>;
}

interface CookieSession {
  token: string | null;
  ingressSlug: string | null;
  workspaceId: string | null;
}

export const OAUTH_NEXT_KEY = "hookdash_oauth_next";

// Only same-origin relative paths; "//host" and "/\host" are protocol-relative in browsers
export function getSafeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

const sessionListeners = new Set<() => void>();
let cachedCookieString: string | null = null;
let cachedSession: CookieSession | null = null;

function subscribeSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifySession() {
  sessionListeners.forEach((listener) => listener());
}

function getSessionSnapshot(): CookieSession {
  if (cachedSession && cachedCookieString === document.cookie) return cachedSession;
  cachedCookieString = document.cookie;
  cachedSession = {
    token: Cookies.get("token") ?? null,
    ingressSlug: Cookies.get("ingressSlug") ?? null,
    workspaceId: Cookies.get("workspaceId") ?? null,
  };
  return cachedSession;
}

// Cookies are unknown on the server; null keeps hydration consistent and signals loading
function getServerSessionSnapshot(): CookieSession | null {
  return null;
}

async function loadWorkspaces(preferredId: string | null): Promise<Workspace[]> {
  const list = await workspacesApi.list();
  const wsId = list.some((w) => w.id === preferredId)
    ? preferredId
    : (list[0]?.id ?? null);
  if (wsId) Cookies.set("workspaceId", wsId, { expires: 30 });
  else Cookies.remove("workspaceId");
  notifySession();
  return list;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const loadedForToken = useRef<string | null>(null);

  const token = session?.token ?? null;

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await loadWorkspaces(Cookies.get("workspaceId") ?? null);
      setWorkspaceList(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!token || loadedForToken.current === token) return;
    loadedForToken.current = token;
    let cancelled = false;
    loadWorkspaces(Cookies.get("workspaceId") ?? null)
      .then((list) => {
        if (!cancelled) setWorkspaceList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Resolves once the workspace cookie is set, so the first dashboard requests carry it
  const setSession = useCallback(async (newToken: string, ingressSlug: string) => {
    const previousWorkspaceId = Cookies.get("workspaceId") ?? null;
    Cookies.set("token", newToken, { expires: 7 });
    Cookies.set("ingressSlug", ingressSlug, { expires: 7 });
    Cookies.remove("workspaceId");
    loadedForToken.current = newToken;
    try {
      const list = await loadWorkspaces(previousWorkspaceId);
      setWorkspaceList(list);
    } catch {
      loadedForToken.current = null;
      notifySession();
    }
  }, []);

  // Same user, new token (e.g. after a password change revoked the old one)
  const replaceToken = useCallback((newToken: string) => {
    Cookies.set("token", newToken, { expires: 7 });
    loadedForToken.current = newToken;
    notifySession();
  }, []);

  const login = useCallback(
    async (email: string, password: string, next?: string | null) => {
      const res = await authApi.login(email, password);
      await setSession(res.accessToken, res.ingressSlug);
      router.push(getSafeNext(next) ?? "/dashboard");
    },
    [router, setSession],
  );

  const signup = useCallback(
    async (email: string, password: string): Promise<string> => {
      const res = await authApi.signup(email, password);
      await setSession(res.accessToken, res.ingressSlug);
      return res.ingressSlug;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    Cookies.remove("token");
    Cookies.remove("ingressSlug");
    Cookies.remove("workspaceId");
    loadedForToken.current = null;
    setWorkspaceList([]);
    notifySession();
    router.push("/login");
  }, [router]);

  const switchWorkspace = useCallback((workspaceId: string, redirectTo?: string) => {
    Cookies.set("workspaceId", workspaceId, { expires: 30 });
    if (redirectTo) window.location.assign(redirectTo);
    else window.location.reload();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        ingressSlug: session?.ingressSlug ?? null,
        isLoading: session === null,
        currentWorkspaceId: session?.workspaceId ?? null,
        workspaceList,
        login,
        signup,
        setSession,
        replaceToken,
        logout,
        switchWorkspace,
        refreshWorkspaces,
      }}
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
