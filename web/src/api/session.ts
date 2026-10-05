const TOKEN_KEY = "ai-mentor-token";
export const AUTH_EXPIRED_EVENT = "ai-mentor-auth-expired";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function expireSession(): void {
  clearToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
