import type { Task } from "../../api/mentor";

interface TaskSession {
  original: Task | null;
  completed: string[];
}

const key = (userId: number) => `ai-mentor-task-session-${userId}`;
function read(userId: number): TaskSession {
  try {
    return JSON.parse(sessionStorage.getItem(key(userId)) ?? "null") ?? { original: null, completed: [] };
  } catch {
    return { original: null, completed: [] };
  }
}

// Сервер пока возвращает последнюю реплику вместо задания, в том числе после завершения.
// Сохраняем подтверждённое состояние только для текущей вкладки и пользователя.
export function restoreTask(userId: number, task: Task | null): Task | null {
  const state = read(userId);
  if (!task || state.completed.includes(task.question_id)) return null;
  return state.original?.question_id === task.question_id ? state.original : task;
}

export function rememberTask(userId: number, task: Task): void {
  const state = read(userId);
  sessionStorage.setItem(key(userId), JSON.stringify({ ...state, original: task }));
}

export function completeTask(userId: number, questionId: string): void {
  const state = read(userId);
  sessionStorage.setItem(key(userId), JSON.stringify({ ...state, completed: [...new Set([...state.completed, questionId])].slice(-20) }));
}
