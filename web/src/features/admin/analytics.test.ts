import { describe, expect, it } from "vitest";
import type { AdminStats } from "../../api/mentor";
import { buildActivity, buildGroups, buildSkills, dayTime, heatColor, skillColor } from "./analytics";

const empty: AdminStats = { total_students: 0, active_groups_count: 0, avg_progress_by_skill: [], weakest_skills: [], activity_by_group: [], completed_tasks_by_group: [], daily_activity: [] };
describe("данные административных графиков", () => {
  it("сортирует даты, суммирует группы и повторные записи, различает пропуск и ноль", () => {
    const data: AdminStats = { ...empty, daily_activity: [
      { day: "2026-10-08", group_id: 1, group_name: "А", messages_count: 0 },
      { day: "2026-10-05", group_id: 1, group_name: "А", messages_count: 3 },
      { day: "2026-10-05", group_id: 2, group_name: "Б", messages_count: 7 },
      { day: "2026-10-05", group_id: 1, group_name: "А", messages_count: 2 },
    ] };
    const result = buildActivity(data);
    expect(result.daily).toEqual([{ day: "2026-10-05", messages: 12 }, { day: "2026-10-06", messages: null }, { day: "2026-10-07", messages: null }, { day: "2026-10-08", messages: 0 }]);
    expect(result.total).toBe(12);
    expect(result.average).toBe(6);
    expect(result.values.get("2026-10-05")?.get(1)).toBe(5);
    expect(heatColor(null, 12)).not.toBe(heatColor(0, 12));
    const filtered = buildActivity(data, "2");
    expect(filtered.dates).toEqual(result.dates);
    expect(filtered.total).toBe(7);
    expect(filtered.average).toBe(7);
    expect(filtered.daily.at(-1)?.messages).toBeNull();
  });
  it("считает ритм недели по наблюдаемым датам, включая явные нули", () => {
    const result = buildActivity({ ...empty, daily_activity: [
      { day: "2026-10-05", group_id: 1, group_name: "А", messages_count: 10 },
      { day: "2026-10-12", group_id: 1, group_name: "А", messages_count: 0 },
      { day: "2026-10-06", group_id: 1, group_name: "А", messages_count: 3 },
    ] });
    expect(result.weekdays[0]).toEqual({ name: "Пн", total: 10, days: 2, average: 5 });
    expect(result.weekdays[1].average).toBe(3);
    expect(result.weekdays[2].average).toBeNull();
  });
  it("сохраняет даты будущего из API и отбрасывает невозможные даты", () => {
    expect(Number.isNaN(dayTime("2026-02-30"))).toBe(true);
    expect(Number.isNaN(dayTime("2026-2-3"))).toBe(true);
    const result = buildActivity({ ...empty, daily_activity: [{ day: "2030-01-01", group_id: 1, group_name: "А", messages_count: 9 }, { day: "2026-02-30", group_id: 1, group_name: "А", messages_count: 100 }] });
    expect(result.dates).toEqual(["2030-01-01"]);
    expect(result.total).toBe(9);
  });
  it("соединяет группы по ID, отсутствие результатов не превращает в ноль и не делит на ноль", () => {
    const result = buildGroups({ ...empty,
      activity_by_group: [{ group_id: 1, group_name: "А", total_messages: 50, total_tasks: 20 }, { group_id: 2, group_name: "Б", total_messages: 3, total_tasks: 0 }],
      completed_tasks_by_group: [{ group_id: 1, group_name: "А", completed_tasks: 10, active_students: 4 }, { group_id: 3, group_name: "В", completed_tasks: 0, active_students: 0 }],
    });
    expect(result.find((row) => row.id === 1)?.perStudent).toBe(2.5);
    expect(result.find((row) => row.id === 2)?.completed).toBeNull();
    expect(result.find((row) => row.id === 3)?.messages).toBeNull();
    expect(result.find((row) => row.id === 3)?.perStudent).toBeNull();
  });
  it("распределяет средние навыков по непересекающимся диапазонам, включая 100%", () => {
    const skills = [0, 19.9, 20, 60, 100].map((avg_level, skill_id) => ({ skill_id, skill: String(skill_id), avg_level, students_count: 10 }));
    const result = buildSkills(skills);
    expect(result.histogram.map((row) => row.count)).toEqual([2, 1, 0, 1, 1]);
    expect(result.mean).toBeCloseTo(39.98);
  });
  it("пустой ответ и группа без записей не дают ложных средних", () => {
    expect(buildActivity(empty).average).toBeNull();
    expect(buildActivity(empty).peak).toBeUndefined();
    expect(buildSkills([]).mean).toBeNull();
    expect(buildGroups(empty)).toEqual([]);
  });
  it("цвет относительной карты остаётся определённым при одинаковых оценках", () => {
    expect(skillColor(60, 60, 60)).toMatch(/^#[\da-f]{6}$/);
    expect(skillColor(40, 40, 80)).not.toBe(skillColor(80, 40, 80));
    expect(skillColor(100, 40, 80)).toBe(skillColor(80, 40, 80));
  });
});
