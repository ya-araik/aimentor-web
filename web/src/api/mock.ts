import { ApiError, type RequestOptions } from "./client";
import { getToken } from "./session";
import type {
  ChatHistory,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  Group,
  LoginRequest,
  LoginResponse,
  Progress,
  RegisterRequest,
  RegisterResponse,
  Skill,
  Task,
  User,
  AdminStats,
} from "./mentor";

// Локальный демонстрационный API. Используется только при DEV + VITE_DEMO_MODE=true.
const STORAGE_KEY = "ai-mentor-dev-data-v2";
const groups: Group[] = [
  { id: 1, name: "2ИИ1" },
  { id: 2, name: "1ПР1" },
];
const skills: Skill[] = [
  { id: 35, name: "Основы программирования", description: "Переменные, условия и функции" },
  { id: 36, name: "Структуры данных", description: "Списки, словари и выбор структуры" },
  { id: 37, name: "Работа с данными", description: "Обработка и проверка входных данных" },
];

interface MockUser extends User {
  password: string;
  groupId: number | null;
}

interface MockState {
  users: MockUser[];
  messages: Record<number, ChatMessage[]>;
  currentTasks: Record<number, Task | null>;
  progress: Record<number, Progress[]>;
}

const initialState: MockState = {
  users: [
    {
      id: 1,
      username: "student",
      password: "student123",
      first_name: "Анна",
      middle_name: "",
      last_name: "Иванова",
      group: "2ИИ1",
      groupId: 1,
      role: "student",
      current_streak: 0,
      longest_streak: 0,
    },
    { id: 2, username: "admin", password: "admin123", first_name: "Администратор", middle_name: "", last_name: "Демо", group: "", groupId: null, role: "admin", current_streak: 0, longest_streak: 0 },
  ],
  messages: { 1: [] },
  currentTasks: { 1: null },
  progress: { 1: [{ skill_id: 35, skill: skills[0].name, level: 35 }] },
};

function state(): MockState {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(initialState);
  try {
    return JSON.parse(stored) as MockState;
  } catch {
    return structuredClone(initialState);
  }
}

function save(value: MockState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function publicUser(user: MockUser): User {
  const { password: _password, groupId: _groupId, ...profile } = user;
  void _password;
  void _groupId;
  return profile;
}

function currentUser(data: MockState): MockUser {
  const token = getToken();
  const id = token?.startsWith("demo-token-") ? Number(token.slice(11)) : NaN;
  const user = data.users.find((item) => item.id === id);
  if (!user) throw new ApiError("Сеанс завершился. Войдите снова.", 401);
  return user;
}

function cast<T>(value: unknown): T {
  return value as T;
}

export async function mockRequest<T>(path: string, options: RequestOptions): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const data = state();
  const method = options.method ?? "GET";

  if (path === "/groups" && method === "GET") return cast<T>(groups);

  if (path === "/register" && method === "POST") {
    const body = options.body as RegisterRequest;
    if (data.users.some((item) => item.username === body.username)) {
      throw new ApiError("Этот логин уже занят.", 409);
    }
    const group = groups.find((item) => item.id === body.group_id);
    const id = Math.max(...data.users.map((item) => item.id)) + 1;
    data.users.push({
      id,
      username: body.username,
      password: body.password,
      first_name: body.first_name ?? "",
      middle_name: body.middle_name ?? "",
      last_name: body.last_name ?? "",
      group: group?.name ?? "",
      groupId: body.group_id ?? null,
      role: body.role ?? "student",
      current_streak: 0,
      longest_streak: 0,
    });
    data.messages[id] = [];
    data.currentTasks[id] = null;
    data.progress[id] = [];
    save(data);
    return cast<T>({ user_id: id, username: body.username } satisfies RegisterResponse);
  }

  if (path === "/login" && method === "POST") {
    const body = options.body as LoginRequest;
    const user = data.users.find(
      (item) => item.username === body.username && item.password === body.password,
    );
    if (!user) throw new ApiError("Неверный логин или пароль.", 401);
    return cast<T>({ token: `demo-token-${user.id}`, user: publicUser(user) } satisfies LoginResponse);
  }

  const user = currentUser(data);
  if (path === "/me") return cast<T>(publicUser(user));
  if (path.startsWith("/administration/stats")) {
    if (user.role !== "admin") throw new ApiError("Недостаточно прав для просмотра статистики.", 403);
    const stats: AdminStats = {
      total_students: data.users.filter((item) => item.role === "student").length,
      active_groups_count: groups.length,
      avg_progress_by_skill: [{ skill_id: 35, skill: skills[0].name, avg_level: 35, students_count: 1 }],
      weakest_skills: [{ skill_id: 35, skill: skills[0].name, avg_level: 35, students_count: 1 }],
      activity_by_group: [{ group_id: 1, group_name: "2ИИ1", total_messages: Object.values(data.messages).flat().length, total_tasks: 1 }],
      completed_tasks_by_group: [{ group_id: 1, group_name: "2ИИ1", completed_tasks: user.current_streak, active_students: 1 }],
      daily_activity: [{ day: new Date().toISOString().slice(0, 10), group_id: 1, group_name: "2ИИ1", messages_count: Object.values(data.messages).flat().length }],
    };
    return cast<T>(stats);
  }
  if (user.role !== "student") throw new ApiError("Действие доступно только студенту.", 403);
  if (path === "/streak") return cast<T>({ current_streak: user.current_streak, longest_streak: user.longest_streak });
  if (path === "/skills") return cast<T>(skills);
  if (path === "/progress") return cast<T>(data.progress[user.id] ?? []);
  if (path === "/task/current") return cast<T>(data.currentTasks[user.id] ?? null);

  if (path.startsWith("/chat/history")) {
    const limit = Number(new URL(path, "http://mock.local").searchParams.get("limit") ?? 50);
    const messages = (data.messages[user.id] ?? []).slice(-limit);
    return cast<T>({ user_id: user.id, username: user.username, messages } satisfies ChatHistory);
  }

  if (path === "/task" && method === "POST") {
    if (!user.group) throw new ApiError("Для задания нужна учебная группа.", 503);
    const task: Task = {
      question_id: crypto.randomUUID(),
      question: "Напишите функцию, которая находит максимальное число в списке. Какие случаи нужно проверить перед возвратом результата?",
    };
    data.currentTasks[user.id] = task;
    data.messages[user.id] ??= [];
    data.messages[user.id].push({
      id: crypto.randomUUID(),
      role: "ai",
      content: task.question,
      question_id: task.question_id,
      timestamp: new Date().toISOString(),
    });
    save(data);
    return cast<T>(task);
  }

  if (path === "/chat" && method === "POST") {
    const body = options.body as ChatRequest;
    data.messages[user.id] ??= [];
    data.messages[user.id].push({
      id: crypto.randomUUID(),
      role: "user",
      content: body.message,
      question_id: body.question_id ?? null,
      timestamp: new Date().toISOString(),
    });
    const isTaskAnswer = Boolean(
      body.question_id && body.question_id === data.currentTasks[user.id]?.question_id,
    );
    const answer = isTaskAnswer
      ? "Ответ принят. В демо-режиме задание оценено; проверьте случай пустого списка."
      : "Как бы вы сами подошли к этому вопросу? С какого шага начнёте?";
    data.messages[user.id].push({
      id: crypto.randomUUID(),
      role: "ai",
      content: answer,
      question_id: body.question_id ?? null,
      timestamp: new Date().toISOString(),
    });
    if (isTaskAnswer) {
      data.currentTasks[user.id] = null;
      data.progress[user.id] = [{ skill_id: 35, skill: skills[0].name, level: 70, weaknesses: "Проверка пустого списка" }];
      user.current_streak = 1;
      user.longest_streak = Math.max(user.longest_streak, 1);
    }
    save(data);
    return cast<T>({ message: answer, question_id: body.question_id ?? null, assessment: isTaskAnswer ? { level: 70, skill_id: 35, feedback: "Проверьте случай пустого списка." } : null, task_completed: isTaskAnswer } satisfies ChatResponse);
  }

  throw new ApiError(`Нет демонстрационного ответа для ${method} ${path}`, 404);
}
