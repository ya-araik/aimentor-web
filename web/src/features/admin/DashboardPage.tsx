import { lazy, Suspense, useState } from "react";
import { Badge, Box, Button, Group, Paper, Progress, Select, SimpleGrid, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconChartBar, IconChartDots, IconGridDots, IconRefresh, IconCube } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { mentorApi } from "../../api/mentor";
import { QueryError, QueryLoading } from "../../shared/ui/QueryMessage";
import { buildSkills, chartColors, number, type SkillStat } from "./analytics";
import { ActivityCharts } from "./ActivityCharts";
import { GroupCharts } from "./GroupCharts";
import { SkillCharts } from "./SkillCharts";
import { SourceTables } from "./SourceTables";
import { Empty, Panel } from "./ChartPanel";
import "./dashboard.css";
const ThreeDCharts = lazy(() => import("./ThreeDCharts").then((module) => ({ default: module.ThreeDCharts })));

function WeakSkills({ skills }: { skills: SkillStat[] }) {
  return <Panel title="Навыки, которым нужно внимание" description="Топ-5 слабых навыков по версии сервера. Среднее по оценённым студентам.">{skills.length ? <Stack gap="md">{skills.map((item, index) => <div key={item.skill_id} className="weak-skill-row"><span className="weak-skill-index">{index + 1}</span><Box><Group justify="space-between" gap="xs" wrap="nowrap"><Text size="sm" fw={550}>{item.skill}</Text><Text size="sm" fw={650} style={{ whiteSpace: "nowrap" }}>{number(item.avg_level)}%</Text></Group><Progress value={item.avg_level} color="yellow.7" size={5} mt={8} aria-label={`Среднее освоение ${item.skill}`} /><Text size="xs" c="dimmed" mt={5}>Студентов с оценкой: {number(item.students_count)}</Text></Box></div>)}</Stack> : <Empty />}</Panel>;
}

export function DashboardPage() {
  const [days, setDays] = useState("30");
  const [tab, setTab] = useState<string | null>("overview");
  const stats = useQuery({ queryKey: ["adminStats", Number(days)], queryFn: () => mentorApi.getAdminStats(Number(days)), retry: false });
  const data = stats.data;
  const summary = data ? buildSkills(data.avg_progress_by_skill) : null;
  return <Stack gap="lg" className="analytics-page"><Group justify="space-between" align="flex-end"><Box><Badge variant="light" color="blue" mb={8}>Аналитика обучения</Badge><Title order={1} size="h2">Дашборд</Title><Text size="sm" c="dimmed" mt={4}>От активности в чате — к результатам учебной практики</Text></Box><Group align="flex-end"><Select label="Период активности" value={days} onChange={(value) => setDays(value ?? "30")} data={[{ value: "7", label: "7 дней" }, { value: "30", label: "30 дней" }, { value: "90", label: "90 дней" }, { value: "365", label: "365 дней" }]} w={165} allowDeselect={false} /><Button variant="default" leftSection={<IconRefresh size={17} />} onClick={() => void stats.refetch()} loading={stats.isFetching}>Обновить</Button></Group></Group><Text size="xs" c="dimmed">Период применяется только к ежедневной активности. Общие показатели, сравнение групп и навыки от него не зависят.</Text>
    {stats.isPending && <QueryLoading />}{stats.error && <QueryError error={stats.error} onRetry={() => void stats.refetch()} />}
    {data && <><SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">{[
      { label: "Всего студентов", value: number(data.total_students), note: "В учебной системе", color: chartColors[0] },
      { label: "Активных групп", value: number(data.active_groups_count), note: "По общей сводке", color: chartColors[1] },
      { label: "Выполнено заданий", value: data.completed_tasks_by_group.length ? number(data.completed_tasks_by_group.reduce((sum, item) => sum + item.completed_tasks, 0)) : "—", note: "Сумма по группам в ответе", color: chartColors[3] },
      { label: "Среднее по навыкам", value: summary?.mean == null ? "—" : `${number(summary.mean)}%`, note: `${data.avg_progress_by_skill.length} навыков · общая сводка`, color: chartColors[2] },
    ].map((item) => <Paper key={item.label} withBorder p="lg" className="analytics-metric" style={{ borderTopColor: item.color }}><Text size="sm" c="dimmed">{item.label}</Text><Text className="analytics-big">{item.value}</Text><Text size="xs" c="dimmed">{item.note}</Text></Paper>)}</SimpleGrid>
    <Tabs value={tab} onChange={setTab} keepMounted={false}><Tabs.List mb="lg"><Tabs.Tab value="overview" leftSection={<IconChartBar size={17} />}>Обзор</Tabs.Tab><Tabs.Tab value="skills" leftSection={<IconChartDots size={17} />}>Навыки</Tabs.Tab><Tabs.Tab value="three-d" leftSection={<IconCube size={17} />}>3D</Tabs.Tab><Tabs.Tab value="source" leftSection={<IconGridDots size={17} />}>Данные</Tabs.Tab></Tabs.List><Tabs.Panel value="overview"><Stack gap="xl"><ActivityCharts data={data} days={Number(days)} /><GroupCharts data={data} /><WeakSkills skills={data.weakest_skills} /></Stack></Tabs.Panel><Tabs.Panel value="skills"><SkillCharts data={data} /></Tabs.Panel><Tabs.Panel value="three-d"><Suspense fallback={<QueryLoading />}><ThreeDCharts data={data} days={Number(days)} updatedAt={stats.dataUpdatedAt} /></Suspense></Tabs.Panel><Tabs.Panel value="source"><SourceTables data={data} /></Tabs.Panel></Tabs>
    <Text size="xs" c="dimmed">Сводка загружена: {new Date(stats.dataUpdatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}. Индивидуальные оценки студентов и прогресс каждой группы по отдельному навыку в API отсутствуют.</Text></>}
  </Stack>;
}
