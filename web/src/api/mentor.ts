import type { components } from "./schema";
import { request } from "./client";

type Schemas = components["schemas"];

export type User = Schemas["UserPublic"];
export type Group = Schemas["GroupItem"];
export type Skill = Schemas["SkillItem"];
export type Progress = Schemas["ProgressItem"];
export type ChatMessage = Schemas["MessageItem"];
export type ChatHistory = Schemas["ChatHistoryResponse"];
export type Task = Schemas["TaskResponse"];
export type ChatRequest = Schemas["ChatRequest"];
export type ChatResponse = Schemas["ChatResponse"];
export type LoginRequest = Schemas["LoginRequest"];
export type LoginResponse = Schemas["LoginResponse"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type RegisterResponse = Schemas["RegisterResponse"];
export type Streak = Schemas["StreakItem"];
export type AdminStats = Schemas["AdminStatsResponse"];
export type Assessment = Schemas["EvaluateStudentAnswerResponse"];

function chronologicalHistory(history: ChatHistory): ChatHistory {
  const items = history.messages.map((message) => ({ message, time: message.timestamp ? Date.parse(message.timestamp) : NaN, zoned: Boolean(message.timestamp && /(?:Z|[+-]\d{2}:\d{2})$/i.test(message.timestamp)) }));
  // В живом API ответ ментора пока приходит перед вопросом. Сортировать безопасно
  // только полный набор известных времён; null и смесь времён с/без зоны сохраняем как есть.
  if (items.some((item) => !Number.isFinite(item.time)) || items.some((item) => item.zoned !== items[0]?.zoned)) return history;
  return { ...history, messages: items.sort((a, b) => a.time - b.time).map((item) => item.message) };
}

export const mentorApi = {
  getGroups: () => request<Group[]>("/groups", { auth: false }),
  register: (body: RegisterRequest) =>
    request<RegisterResponse>("/register", { method: "POST", body, auth: false }),
  login: (body: LoginRequest) =>
    request<LoginResponse>("/login", { method: "POST", body, auth: false }),
  getMe: () => request<User>("/me"),
  getSkills: () => request<Skill[]>("/skills"),
  getProgress: () => request<Progress[]>("/progress"),
  getStreak: () => request<Streak>("/streak"),
  getAdminStats: (days = 30) => request<AdminStats>(`/administration/stats?days=${days}`),
  getHistory: async (limit = 50) => chronologicalHistory(await request<ChatHistory>(`/chat/history?limit=${limit}`)),
  getCurrentTask: () => request<Task | null>("/task/current"),
  startTask: () => request<Task>("/task", { method: "POST" }),
  sendChat: (body: ChatRequest) =>
    request<ChatResponse>("/chat", { method: "POST", body }),
};
