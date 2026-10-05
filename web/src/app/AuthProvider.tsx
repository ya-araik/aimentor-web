import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AUTH_EXPIRED_EVENT, clearToken, getToken, saveToken } from "../api/session";
import { mentorApi, type LoginResponse, type User } from "../api/mentor";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  login: (result: LoginResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(getToken);

  useEffect(() => {
    const handleExpired = () => {
      setToken(null);
      queryClient.clear();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: mentorApi.getMe,
    enabled: Boolean(token),
    retry: false,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: token ? (meQuery.data ?? null) : null,
      loading: Boolean(token) && meQuery.isPending,
      error: token && meQuery.isError ? meQuery.error : null,
      retry: () => void meQuery.refetch(),
      login: (result) => {
        queryClient.clear();
        saveToken(result.token);
        queryClient.setQueryData(["me"], result.user);
        setToken(result.token);
      },
      logout: () => {
        clearToken();
        queryClient.clear();
        setToken(null);
      },
    }),
    [token, meQuery.data, meQuery.isPending, meQuery.isError, meQuery.error, meQuery, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
