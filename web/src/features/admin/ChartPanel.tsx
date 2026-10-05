import type { ReactNode } from "react";
import { Box, Group, Paper, Text, Title } from "@mantine/core";
import { IconChartBar } from "@tabler/icons-react";
import { CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { dayTime, longDate, number } from "./analytics";

export function Panel({ title, description, children, tools }: { title: string; description: string; children: ReactNode; tools?: ReactNode }) {
  return <Paper component="section" withBorder p="lg" className="analytics-panel"><Group justify="space-between" align="flex-start" mb="lg"><Box><Title order={3} size="h4">{title}</Title><Text size="xs" c="dimmed" mt={5}>{description}</Text></Box>{tools}</Group>{children}</Paper>;
}
export function Empty({ text = "Пока нет данных для этого графика." }: { text?: string }) { return <Box className="analytics-empty"><IconChartBar size={28} stroke={1.3} /><Text size="sm" c="dimmed">{text}</Text></Box>; }
export function Chart({ label, children, height = 260 }: { label: string; children: ReactNode; height?: number }) {
  return <div className="analytics-chart" role="figure" aria-label={label} style={{ height }}><ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer></div>;
}
function ChartTip({ active, label, payload }: { active?: boolean; label?: unknown; payload?: readonly { value?: unknown; name?: unknown; color?: string; payload?: { skill?: string; avg_level?: number; students_count?: number } }[] }) {
  if (!active || !payload?.length) return null;
  const skill = payload[0].payload;
  return <div className="analytics-tooltip">{skill?.skill ? <><strong>{skill.skill}</strong><div>Освоение: {number(skill.avg_level ?? 0)}%</div><div>Студентов с оценкой: {number(skill.students_count ?? 0)}</div></> : <>{label != null && <strong>{typeof label === "string" && Number.isFinite(dayTime(label)) ? longDate(label) : String(label)}</strong>}{payload.map((entry, index) => <div key={index}><span style={{ color: entry.color }}>{String(entry.name ?? "Значение")}</span>: {typeof entry.value === "number" ? number(entry.value) : "Нет данных"}</div>)}</>}</div>;
}
export const grid = <CartesianGrid vertical={false} stroke="#e9edf2" strokeDasharray="3 3" />;
export const tip = <Tooltip content={<ChartTip />} />;
export const axis = { tickLine: false, axisLine: false, tick: { fill: "#647180", fontSize: 11 } };
