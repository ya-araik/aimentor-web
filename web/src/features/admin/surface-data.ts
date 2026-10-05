import type { AdminStats } from "../../api/mentor";
import { buildActivity, dayTime, longDate, number, shortDate, type SkillStat } from "./analytics";

const DAY = 86_400_000;
export const weekdayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export interface SurfacePoint {
  key: string;
  x: number;
  y: number;
  z: number;
  label: string;
  detail: string;
  skills?: SkillStat[];
}
export interface SurfaceModel {
  x: number[];
  y: number[];
  z: (number | null)[][];
  xTicks: number[];
  xLabels: string[];
  yTicks: number[];
  yLabels: string[];
  xTitle: string;
  yTitle: string;
  zTitle: string;
  points: SurfacePoint[];
  invalidCount: number;
  total: number;
}

export function calendarSurface(data: AdminStats, group = "all"): SurfaceModel {
  const activity = buildActivity(data, group);
  const weeks = [...new Set(activity.dates.map((day) => {
    const time = dayTime(day);
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    return new Date(time - weekday * DAY).toISOString().slice(0, 10);
  }))].sort();
  const x = weeks.map((_, index) => index);
  const y = weekdayNames.map((_, index) => index);
  const z: (number | null)[][] = y.map(() => x.map(() => null));
  const points: SurfacePoint[] = [];
  for (const item of activity.daily) {
    if (item.messages === null) continue;
    const time = dayTime(item.day);
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    const week = new Date(time - weekday * DAY).toISOString().slice(0, 10);
    const column = weeks.indexOf(week);
    z[weekday][column] = item.messages;
    points.push({ key: item.day, x: column, y: weekday, z: item.messages, label: longDate(item.day), detail: `${longDate(item.day)} · ${weekdayNames[weekday]} · ${number(item.messages)} сообщений` });
  }
  return { x, y, z, xTicks: x, xLabels: weeks.map(shortDate), yTicks: y, yLabels: weekdayNames, xTitle: "Неделя с", yTitle: "День недели", zTitle: "Сообщения", points, total: activity.total, invalidCount: data.daily_activity.filter((item) => !Number.isFinite(dayTime(item.day))).length };
}

export function skillDistributionSurface(skills: SkillStat[]): SurfaceModel {
  const valid = skills.filter((item) => Number.isFinite(item.avg_level) && item.avg_level >= 0 && item.avg_level <= 100 && Number.isInteger(item.students_count) && item.students_count >= 0);
  // 5 percentage points per mastery interval; at most about 40 coverage rows.
  // Every valid skill belongs to exactly one cell, including a score of 100%.
  const coverageStep = Math.max(1, Math.ceil(Math.max(0, ...valid.map((item) => item.students_count)) / 40));
  const coverageBins = valid.map((item) => Math.floor(item.students_count / coverageStep));
  const first = valid.length ? Math.max(0, Math.min(...coverageBins) - 1) : 0;
  const last = valid.length ? Math.max(...coverageBins) + 1 : 1;
  const x = Array.from({ length: 20 }, (_, index) => index * 5 + 2.5);
  const y = Array.from({ length: last - first + 1 }, (_, index) => (first + index) * coverageStep + (coverageStep - 1) / 2);
  const cells: SkillStat[][][] = y.map(() => x.map(() => []));
  for (const skill of valid) cells[Math.floor(skill.students_count / coverageStep) - first][Math.min(19, Math.floor(skill.avg_level / 5))].push(skill);
  const z = cells.map((row) => row.map((cell) => cell.length));
  const points: SurfacePoint[] = [];
  cells.forEach((row, rowIndex) => row.forEach((items, column) => {
    const lower = column * 5;
    const coverageLower = (first + rowIndex) * coverageStep;
    const mastery = `${lower}–${lower + 5}%${column === 19 ? " (100% включено)" : " (верхняя граница не входит)"}`;
    const coverage = coverageStep === 1 ? String(coverageLower) : `${coverageLower}–${coverageLower + coverageStep - 1}`;
    points.push({ key: `${column}-${rowIndex}`, x: x[column], y: y[rowIndex], z: items.length, label: `${lower}–${lower + 5}% · охват ${coverage}`, detail: `Освоение ${mastery} · студентов с оценкой: ${coverage} · навыков: ${items.length}`, skills: items });
  }));
  const yLabels = y.map((_, index) => {
    const lower = (first + index) * coverageStep;
    return coverageStep === 1 ? number(lower) : `${number(lower)}–${number(lower + coverageStep - 1)}`;
  });
  return { x, y, z, xTicks: [2.5, 27.5, 52.5, 77.5, 97.5], xLabels: ["0–5", "25–30", "50–55", "75–80", "95–100"], yTicks: y, yLabels, xTitle: "Освоение, %", yTitle: "Студентов с оценкой", zTitle: "Навыков", points, total: valid.length, invalidCount: skills.length - valid.length };
}

// Bilinear interpolation only inside known cells; missing samples are never
// replaced by zero or bridged. Exact original nodes remain unchanged.
export function interpolateSurface(model: Pick<SurfaceModel, "x" | "y" | "z">, factor = 4) {
  const expand = (values: number[]) => values.flatMap((value, index) => index === values.length - 1 ? [value] : Array.from({ length: factor }, (_, step) => value + (values[index + 1] - value) * step / factor));
  const x = expand(model.x);
  const y = expand(model.y);
  const z = y.map((_, row) => x.map((_, column) => {
    const sourceRow = Math.floor(row / factor);
    const sourceColumn = Math.floor(column / factor);
    const tx = column % factor / factor;
    const ty = row % factor / factor;
    const samples = [
      { row: sourceRow, column: sourceColumn, weight: (1 - tx) * (1 - ty) },
      { row: sourceRow, column: sourceColumn + 1, weight: tx * (1 - ty) },
      { row: sourceRow + 1, column: sourceColumn, weight: (1 - tx) * ty },
      { row: sourceRow + 1, column: sourceColumn + 1, weight: tx * ty },
    ].filter((sample) => sample.weight > 0);
    let value = 0;
    for (const sample of samples) {
      const source = model.z[sample.row]?.[sample.column];
      if (source == null) return null;
      value += source * sample.weight;
    }
    return value;
  }));
  return { x, y, z };
}

export function hasSurfaceArea(model: Pick<SurfaceModel, "z">) {
  return model.z.some((row, y) => row.some((value, x) => value !== null && row[x + 1] != null && model.z[y + 1]?.[x] != null && model.z[y + 1]?.[x + 1] != null));
}
