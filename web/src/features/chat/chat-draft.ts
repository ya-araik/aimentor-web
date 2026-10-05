const key = (userId: number) => `ai-mentor-chat-draft:${userId}`;

export function readDraft(userId: number): string {
  try { return sessionStorage.getItem(key(userId)) ?? ""; } catch { return ""; }
}

export function saveDraft(userId: number, value: string): void {
  try {
    if (value) sessionStorage.setItem(key(userId), value);
    else sessionStorage.removeItem(key(userId));
  } catch { /* The chat still works if browser storage is unavailable. */ }
}

export function readReplyMode(userId: number, questionId: string | undefined): boolean | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`${key(userId)}:mode`) ?? "null");
    return questionId && value?.questionId === questionId && typeof value.replyToTask === "boolean" ? value.replyToTask : null;
  } catch { return null; }
}

export function saveReplyMode(userId: number, questionId: string | null, replyToTask: boolean): void {
  try {
    if (questionId) sessionStorage.setItem(`${key(userId)}:mode`, JSON.stringify({ questionId, replyToTask }));
    else sessionStorage.removeItem(`${key(userId)}:mode`);
  } catch { /* Mode switching still works without browser storage. */ }
}
