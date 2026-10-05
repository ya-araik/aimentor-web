import type { AdminStats } from "../../api/mentor";

export type SkillStat = AdminStats["avg_progress_by_skill"][number];
export const chartColors = ["#326da8", "#329287", "#b48938", "#8074b1", "#c76b63", "#6d889d"];
export const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
export const shortDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
export const longDate = (day: string) => `${shortDate(day)}.${day.slice(0, 4)}`;
const DAY = 86_400_000;

export function dayTime(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? time : NaN;
}

export function buildActivity(data: AdminStats, group = "all") {
  const valid = data.daily_activity.filter((row) => Number.isFinite(dayTime(row.day)));
  const records = valid.filter((row) => group === "all" || String(row.group_id) === group);
  const values = new Map<string, Map<number, number>>();
  for (const row of records) {
    const day = values.get(row.day) ?? new Map<number, number>();
    day.set(row.group_id, (day.get(row.group_id) ?? 0) + row.messages_count);
    values.set(row.day, day);
  }
  const observed = [...values.keys()].sort();
  const range = [...new Set(valid.map((row) => row.day))].sort();
  // No record means unknown, not zero. UTC arithmetic keeps date-only values
  // stable through timezone and daylight-saving changes.
  const dates: string[] = [];
  if (range.length) {
    const start = dayTime(range[0]);
    const end = dayTime(range[range.length - 1]);
    if ((end - start) / DAY <= 730) {
      for (let time = start; time <= end; time += DAY) dates.push(new Date(time).toISOString().slice(0, 10));
    } else dates.push(...range);
  }
  const daily = dates.map((day) => ({ day, messages: values.has(day) ? [...values.get(day)!.values()].reduce((sum, value) => sum + value, 0) : null }));
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((name) => ({ name, total: 0, days: 0, average: null as number | null }));
  for (const item of daily) {
    if (item.messages === null) continue;
    const weekday = weekdays[(new Date(dayTime(item.day)).getUTCDay() + 6) % 7];
    weekday.total += item.messages;
    weekday.days += 1;
    weekday.average = Math.round(weekday.total / weekday.days * 10) / 10;
  }
  const total = daily.reduce((sum, item) => sum + (item.messages ?? 0), 0);
  const peak = daily.filter((item) => item.messages !== null).sort((a, b) => b.messages! - a.messages!)[0];
  return { dates, daily, values, observed, weekdays, total, peak, average: observed.length ? total / observed.length : null };
}

export function buildGroups(data: AdminStats) {
  const groups = new Map<number, { id: number; name: string; messages: number | null; issued: number | null; completed: number | null; students: number | null; perStudent: number | null }>();
  const ensure = (id: number, name: string) => {
    if (!groups.has(id)) groups.set(id, { id, name, messages: null, issued: null, completed: null, students: null, perStudent: null });
    return groups.get(id)!;
  };
  for (const row of data.activity_by_group) Object.assign(ensure(row.group_id, row.group_name), { messages: row.total_messages, issued: row.total_tasks });
  for (const row of data.completed_tasks_by_group) Object.assign(ensure(row.group_id, row.group_name), { completed: row.completed_tasks, students: row.active_students, perStudent: row.active_students > 0 ? row.completed_tasks / row.active_students : null });
  for (const row of data.daily_activity) ensure(row.group_id, row.group_name);
  return [...groups.values()].sort((a, b) => (b.messages ?? -1) - (a.messages ?? -1));
}

export function buildSkills(skills: SkillStat[]) {
  const histogram = Array.from({ length: 5 }, (_, index) => ({ name: `${index * 20}–${(index + 1) * 20}%`, count: 0 }));
  for (const skill of skills) {
    if (skill.avg_level >= 0 && skill.avg_level <= 100) histogram[Math.min(4, Math.floor(skill.avg_level / 20))].count += 1;
  }
  return { histogram, mean: skills.length ? skills.reduce((sum, row) => sum + row.avg_level, 0) / skills.length : null };
}

export function heatColor(value: number | null, max: number) {
  if (value === null) return "#f0f2f5";
  if (value === 0) return "#e1ebf5";
  const colors = ["#bcd3e9", "#80acd2", "#497eae", "#24537f"];
  return colors[Math.min(3, Math.floor(value / Math.max(1, max) * 4))];
}

export function skillColor(level: number, min: number, max: number) {
  if (max <= min) return chartColors[0];
  const ratio = Math.max(0, Math.min(1, (level - min) / (max - min)));
  return "#" + [208, 163, 75].map((channel, index) => Math.round(channel + ([57, 143, 132][index] - channel) * ratio).toString(16).padStart(2, "0")).join("");
}
