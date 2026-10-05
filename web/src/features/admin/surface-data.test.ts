import { describe, expect, it } from "vitest";
import type { AdminStats } from "../../api/mentor";
import { calendarSurface, hasSurfaceArea, interpolateSurface, skillDistributionSurface } from "./surface-data";

const empty: AdminStats = { total_students: 0, active_groups_count: 0, avg_progress_by_skill: [], weakest_skills: [], activity_by_group: [], completed_tasks_by_group: [], daily_activity: [] };
describe("рельефы по статистике", () => {
  it("раскладывает даты по понедельникам и дням недели через смену года, сохраняя нули и пропуски", () => {
    const data = { ...empty, daily_activity: [
      { day: "2027-01-04", group_id: 1, group_name: "А", messages_count: 0 },
      { day: "2026-12-31", group_id: 1, group_name: "А", messages_count: 3 },
      { day: "2026-12-31", group_id: 2, group_name: "Б", messages_count: 4 },
    ] };
    const model = calendarSurface(data);
    expect(model.xLabels).toEqual(["28.12", "04.01"]);
    expect(model.z[3][0]).toBe(7);
    expect(model.z[0][1]).toBe(0);
    expect(model.z[4][0]).toBeNull();
    expect(model.total).toBe(7);
    expect(calendarSurface(data, "2").z[3][0]).toBe(4);
    expect(calendarSurface(data, "2").z[0][1]).toBeNull();
  });
  it("каждый навык считается один раз; 100% включается в последний интервал, граничные оценки идут в следующий", () => {
    const skills = [0, 4.99, 5, 100].map((avg_level, skill_id) => ({ skill_id, avg_level, students_count: 26, skill: String(skill_id) }));
    const model = skillDistributionSurface(skills);
    expect(model.total).toBe(4);
    expect(model.z.flat().reduce<number>((sum, count) => sum + (count ?? 0), 0)).toBe(4);
    expect(model.points.find((point) => point.x === 2.5 && point.y === 26)?.z).toBe(2);
    expect(model.points.find((point) => point.x === 7.5 && point.y === 26)?.z).toBe(1);
    expect(model.points.find((point) => point.x === 97.5 && point.y === 26)?.z).toBe(1);
    expect(model.points.filter((point) => point.z > 0).flatMap((point) => point.skills ?? []).map((skill) => skill.skill_id).sort()).toEqual([0,1,2,3]);
  });
  it("ограничивает размер распределения для большого охвата без потери навыков", () => {
    const model = skillDistributionSurface([{ skill_id: 1, skill: "А", avg_level: 58, students_count: 10000 }]);
    expect(model.y.length).toBeLessThanOrEqual(43);
    expect(model.points.filter((point) => point.z > 0)[0].skills?.[0].students_count).toBe(10000);
    expect(model.total).toBe(1);
  });
  it("интерполирует известные значения, сохраняя узлы и не заполняя неизвестное", () => {
    const result = interpolateSurface({ x: [0,1], y: [0,1], z: [[0,4],[4,8]] }, 2);
    expect(result.z).toEqual([[0,2,4],[2,4,6],[4,6,8]]);
    const sparse = interpolateSurface({ x: [0,1], y: [0,1], z: [[0,null],[4,8]] }, 2);
    expect(sparse.z[0]).toEqual([0,null,null]);
    expect(sparse.z[1]).toEqual([2,null,null]);
    expect(sparse.z[2]).toEqual([4,6,8]);
    expect(hasSurfaceArea({ z: [[0,null],[4,8]] })).toBe(false);
  });
  it("пустые данные и некорректные значения не дают выдуманных наблюдений", () => {
    expect(calendarSurface(empty).points).toEqual([]);
    expect(skillDistributionSurface([]).total).toBe(0);
    expect(skillDistributionSurface([{ skill_id: 1, skill: "А", avg_level: 101, students_count: 5 }]).invalidCount).toBe(1);
    expect(hasSurfaceArea({ z: [[null,null],[null,null]] })).toBe(false);
  });
});
