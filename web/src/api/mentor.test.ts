import { describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./client";
import { mockRequest } from "./mock";
import { getToken, saveToken } from "./session";
import type { ChatHistory, ChatResponse, LoginResponse, Progress, Task } from "./mentor";
import { mentorApi } from "./mentor";

describe("студенческий сценарий на локальном учебном API", () => {
  it("входит, создаёт задание, отправляет связанный ответ и читает историю", async () => {
    const login = await mockRequest<LoginResponse>("/login", {
      method: "POST",
      auth: false,
      body: { username: "student", password: "student123" },
    });
    saveToken(login.token);

    const task = await mockRequest<Task>("/task", { method: "POST" });
    expect((await mockRequest<Task>("/task/current", {})).question_id).toBe(task.question_id);

    const reply = await mockRequest<ChatResponse>("/chat", {
      method: "POST",
      body: { message: "Сначала проверю, пуст ли список.", question_id: task.question_id },
    });
    const history = await mockRequest<ChatHistory>("/chat/history?limit=50", {});
    const progress = await mockRequest<Progress[]>("/progress", {});

    expect(reply.question_id).toBe(task.question_id);
    expect(reply.task_completed).toBe(true);
    expect(await mockRequest("/task/current", {})).toBeNull();
    expect(history.messages).toHaveLength(3);
    expect(history.messages.every((item) => item.question_id === task.question_id)).toBe(true);
    expect(progress[0].skill_id).toBe(35);
  });
});

describe("ошибки настоящего HTTP-клиента", () => {
  it("исправляет порядок живой истории, когда все времена известны", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ user_id: 1, username: "test", messages: [
      { id: "ai", role: "ai", content: "Ответ", timestamp: "2026-10-05T17:20:11.44412" },
      { id: "user", role: "user", content: "Вопрос", timestamp: "2026-10-05T17:20:05.818336" },
    ] })));
    expect((await mentorApi.getHistory()).messages.map((item) => item.id)).toEqual(["user", "ai"]);
    fetchMock.mockRestore();
  });

  it("сохраняет серверный порядок при null во времени сообщения", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ user_id: 1, username: "test", messages: [
      { id: "ai", role: "ai", content: "Задание", timestamp: null },
      { id: "user", role: "user", content: "Ответ", timestamp: "2026-10-05T17:20:05Z" },
    ] })));
    expect((await mentorApi.getHistory()).messages.map((item) => item.id)).toEqual(["ai", "user"]);
    fetchMock.mockRestore();
  });
  it("сбрасывает JWT после 401 защищённого запроса", async () => {
    saveToken("expired-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(request("/me")).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    fetchMock.mockRestore();
  });

  it("объясняет отказ во входе и не сбрасывает токен", async () => {
    saveToken("existing-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(request("/login", { method: "POST", auth: false, body: {} })).rejects.toMatchObject({
      status: 401,
      message: "Неверный логин или пароль.",
    });
    expect(getToken()).toBe("existing-token");
    fetchMock.mockRestore();
  });

  it("возвращает понятную ошибку при отсутствии связи", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(request("/skills")).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Нет связи"),
    } satisfies Partial<ApiError>);
    fetchMock.mockRestore();
  });
});
