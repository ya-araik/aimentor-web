import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./AuthProvider";
import { mentorApi, type User, type AdminStats } from "../api/mentor";
import { saveToken } from "../api/session";

const student: User = { id: 101, username: "test", first_name: "Тест", last_name: "", middle_name: "", group: "2ИИ1", role: "student", current_streak: 0, longest_streak: 0 };
const stats: AdminStats = { total_students: 12, active_groups_count: 2, avg_progress_by_skill: [], weakest_skills: [], activity_by_group: [], completed_tasks_by_group: [], daily_activity: [] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function open(route: string, user = student) {
  saveToken("test-token");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(["me"], user);
  vi.spyOn(mentorApi, "getMe").mockResolvedValue(user);
  vi.spyOn(mentorApi, "getHistory").mockResolvedValue({ user_id: user.id, username: user.username, messages: [] });
  const renderApp = () => render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><AuthProvider><App /></AuthProvider></MemoryRouter></QueryClientProvider></MantineProvider>);
  return { client, renderApp, view: renderApp() };
}

describe("маршруты по роли", () => {
  it("студент не вызывает административный API при переходе на дашборд", async () => {
    const api = vi.spyOn(mentorApi, "getAdminStats").mockResolvedValue(stats);
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue(null);
    open("/dashboard");
    await screen.findByRole("heading", { name: "Чат с ментором" });
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Дашборд" })).toBeNull();
  });
  it("администратор попадает на дашборд и получает статистику", async () => {
    const api = vi.spyOn(mentorApi, "getAdminStats").mockResolvedValue(stats);
    open("/", { ...student, role: "admin", group: "" });
    await screen.findByText("Всего студентов");
    expect(api).toHaveBeenCalledWith(30);
    expect(screen.queryByRole("link", { name: "Чат и задания" })).toBeNull();
  });
});

describe("завершение задания по контракту", () => {
  it.each([
    { task_completed: true, assessment: null },
    { task_completed: false, assessment: { level: 85, feedback: "Ответ принят", skill_id: 1 } },
  ])("сбрасывает question_id и не восстанавливает завершённое задание: %j", async (result) => {
    const task = { question_id: "task-1", question: "Исходное задание" };
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue(task);
    const send = vi.spyOn(mentorApi, "sendChat").mockResolvedValue({ message: "Ответ ментора", question_id: task.question_id, ...result });
    const session = open("/chat");
    const input = userEvent.setup();
    await screen.findByText(task.question);
    await waitFor(() => expect((screen.getByRole("radio", { name: "Ответ на задание" }) as HTMLInputElement).checked).toBe(true));
    await input.type(screen.getByRole("textbox", { name: "Сообщение ментору" }), "Мой ответ");
    await input.click(screen.getByRole("button", { name: "Отправить" }));
    await screen.findByText("Задание выполнено");
    expect(send).toHaveBeenCalledWith({ message: "Мой ответ", question_id: "task-1" }, expect.anything());
    expect(screen.queryByRole("radio", { name: "Ответ на задание" })).toBeNull();
    session.view.unmount();
    session.client.removeQueries({ queryKey: ["currentTask"] });
    session.renderApp();
    await waitFor(() => expect(screen.getByRole("button", { name: "Получить задание" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByText(task.question)).toBeNull();
    send.mockResolvedValue({ message: "Свободный диалог", task_completed: false });
    await input.type(screen.getByRole("textbox", { name: "Сообщение ментору" }), "Другой вопрос");
    await input.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith({ message: "Другой вопрос", question_id: null }, expect.anything()));
  });
  it("свободный вопрос при активном задании сохраняет черновик и отправляется без question_id", async () => {
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue({ question_id: "active-task", question: "Учебная задача" });
    const send = vi.spyOn(mentorApi, "sendChat").mockResolvedValue({ message: "Объяснение", task_completed: false, assessment: null });
    open("/chat");
    const input = userEvent.setup();
    await screen.findByText("Учебная задача");
    await waitFor(() => expect((screen.getByRole("radio", { name: "Ответ на задание" }) as HTMLInputElement).checked).toBe(true));
    await input.type(screen.getByRole("textbox", { name: "Сообщение ментору" }), "Объясни термин");
    await input.click(screen.getByText("Вопрос ментору", { exact: true }));
    expect((screen.getByRole("textbox", { name: "Сообщение ментору" }) as HTMLTextAreaElement).value).toBe("Объясни термин");
    await input.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ message: "Объясни термин", question_id: null }, expect.anything()));
    expect(screen.getByText("Учебная задача")).toBeTruthy();
  });
  it("пример вопроса заполняет поле и не отправляет сообщение автоматически", async () => {
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue(null);
    const send = vi.spyOn(mentorApi, "sendChat").mockResolvedValue({ message: "Ответ", task_completed: false });
    open("/chat");
    const input = userEvent.setup();
    const prompt = "Объясни разницу между ИИ и машинным обучением";
    await input.click(await screen.findByRole("button", { name: prompt }));
    expect((screen.getByRole("textbox", { name: "Сообщение ментору" }) as HTMLTextAreaElement).value).toBe(prompt);
    expect(send).not.toHaveBeenCalled();
  });
  it("возвращает из экрана задания в чат с черновиком без повторной выдачи", async () => {
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue({ question_id: "read-task", question: "Задание для чтения" });
    const start = vi.spyOn(mentorApi, "startTask");
    open("/chat");
    const input = userEvent.setup();
    await screen.findByText("Задание для чтения");
    await input.type(screen.getByRole("textbox", { name: "Сообщение ментору" }), "Незавершённый ответ");
    await input.click(screen.getByRole("button", { name: "Открыть задание" }));
    await screen.findByRole("heading", { name: "Практическое задание" });
    await input.click(screen.getByRole("button", { name: "Ответить в чате" }));
    await screen.findByRole("heading", { name: "Чат с ментором" });
    expect((screen.getByRole("textbox", { name: "Сообщение ментору" }) as HTMLTextAreaElement).value).toBe("Незавершённый ответ");
    expect(start).not.toHaveBeenCalled();
  });
  it("сохраняет черновик при переходе из чата к навыкам и обратно", async () => {
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue({ question_id: "mode-task", question: "Задача для сохранения режима" });
    vi.spyOn(mentorApi, "getSkills").mockResolvedValue([]);
    vi.spyOn(mentorApi, "getProgress").mockResolvedValue([]);
    open("/chat");
    const input = userEvent.setup();
    await screen.findByText("Задача для сохранения режима");
    await input.click(screen.getByText("Вопрос ментору", { exact: true }));
    await input.type(screen.getByRole("textbox", { name: "Сообщение ментору" }), "Мой черновик");
    await input.click(screen.getByRole("link", { name: "Навыки" }));
    await screen.findByRole("heading", { name: "Навыки и прогресс" });
    await input.click(screen.getByRole("link", { name: "Чат" }));
    await screen.findByRole("heading", { name: "Чат с ментором" });
    expect((screen.getByRole("textbox", { name: "Сообщение ментору" }) as HTMLTextAreaElement).value).toBe("Мой черновик");
    expect((screen.getByRole("radio", { name: "Вопрос ментору" }) as HTMLInputElement).checked).toBe(true);
  });
  it("позволяет получить задание на отдельном экране и перейти к ответу", async () => {
    vi.spyOn(mentorApi, "getCurrentTask").mockResolvedValue(null);
    const start = vi.spyOn(mentorApi, "startTask").mockResolvedValue({ question_id: "new-task", question: "Новая задача" });
    open("/chat?view=task");
    const input = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Получить задание" }).hasAttribute("disabled")).toBe(false));
    await input.click(screen.getByRole("button", { name: "Получить задание" }));
    await screen.findByText("Новая задача");
    expect(start).toHaveBeenCalledTimes(1);
    await input.click(screen.getByRole("button", { name: "Ответить в чате" }));
    await screen.findByRole("heading", { name: "Чат с ментором" });
    expect((screen.getByRole("radio", { name: "Ответ на задание" }) as HTMLInputElement).checked).toBe(true);
  });
});
