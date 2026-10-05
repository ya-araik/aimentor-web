import { expireSession, getToken } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

function errorMessage(status: number, response: unknown, auth: boolean): string {
  if (status === 401) return auth ? "Сеанс завершился. Войдите снова." : "Неверный логин или пароль.";
  if (status === 403) return "Недостаточно прав для этого действия.";
  if (status === 409) return "Этот логин уже занят.";
  if (status === 422) return "Проверьте введённые данные.";

  if (response && typeof response === "object" && "error" in response) {
    const message = response.error;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (status >= 500) return "Сервис временно недоступен. Попробуйте позже.";
  return "Не удалось выполнить запрос.";
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (import.meta.env.DEV && !import.meta.env.VITEST && import.meta.env.VITE_DEMO_MODE === "true") {
    const { mockRequest } = await import("./mock");
    return mockRequest<T>(path, options);
  }

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Запрос отменён.", 0);
    }
    throw new ApiError("Нет связи с сервером. Проверьте подключение и попробуйте снова.", 0);
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 401 && options.auth !== false) expireSession();
    throw new ApiError(errorMessage(response.status, payload, options.auth !== false), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
