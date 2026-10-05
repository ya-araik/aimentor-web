import { useMemo } from "react";
import { Box, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, XAxis, YAxis } from "recharts";
import type { AdminStats } from "../../api/mentor";
import { buildGroups, chartColors, number } from "./analytics";
import { axis, Chart, Empty, grid, Panel, tip } from "./ChartPanel";

export function GroupCharts({ data }: { data: AdminStats }) {
  const groups = useMemo(() => buildGroups(data), [data]);
  const messages = groups.filter((item) => item.messages !== null);
  const tasks = groups.filter((item) => item.issued !== null || item.completed !== null);
  const completed = groups.filter((item) => item.perStudent !== null);
  const total = messages.reduce((sum, row) => sum + row.messages!, 0);
  const pie = messages.filter((item) => item.messages! > 0);
  return <Stack gap="lg"><Box><Title order={2} size="h3">Сравнение групп</Title><Text size="sm" c="dimmed" mt={4}>Общая сводка. Выбранный период и фильтр активности на эти показатели не влияют.</Text></Box><SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
    <Panel title="Диалог с ментором" description="Количество сообщений каждой группы.">{messages.length ? <Chart label="Сообщения по группам"><BarChart data={messages} layout="vertical" margin={{ left: 0, right: 20 }}>{grid}<XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="name" width={62} {...axis} />{tip}<Bar dataKey="messages" name="Сообщения" fill={chartColors[0]} radius={[0, 4, 4, 0]} maxBarSize={36} isAnimationActive={false} /></BarChart></Chart> : <Empty />}</Panel>
    <Panel title="Доля групп в диалоге" description="Распределение общего числа сообщений.">{total > 0 ? <><div className="donut-chart"><Chart label="Доли сообщений по группам" height={205}><PieChart><Pie data={pie} dataKey="messages" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={pie.length > 1 ? 3 : 0} stroke="none" isAnimationActive={false}>{pie.map((item, index) => <Cell key={item.id} fill={chartColors[index % chartColors.length]} />)}</Pie>{tip}</PieChart></Chart><div className="donut-center"><strong>{number(total)}</strong><span>сообщений</span></div></div><Stack gap={7}>{messages.map((item) => <Group key={item.id} justify="space-between" gap="xs"><Text size="sm"><span className="legend-dot" style={{ background: chartColors[Math.max(0, pie.findIndex((row) => row.id === item.id)) % chartColors.length] }} />{item.name}</Text><Text size="sm" fw={600}>{number(item.messages! / total * 100)}% <Text component="span" size="xs" c="dimmed">· {number(item.messages!)}</Text></Text></Group>)}</Stack></> : <Empty />}</Panel>
    <Panel title="Выданные и выполненные задания" description="Два независимых счётчика из общей сводки API.">{tasks.length ? <Chart label="Задания по группам"><BarChart data={tasks} margin={{ left: -20, right: 8 }}>{grid}<XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} />{tip}<Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="issued" name="Выдано" fill={chartColors[0]} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} /><Bar dataKey="completed" name="Выполнено" fill={chartColors[1]} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} /></BarChart></Chart> : <Empty />}<Text size="xs" c="dimmed">Отсутствующий счётчик не заменяется нулём. Доля выполнения не рассчитывается: API не уточняет связь этих счётчиков.</Text></Panel>
    <Panel title="Практика на активного студента" description="Выполненные задания ÷ активные студенты в сводке результатов.">{completed.length ? <Chart label="Выполненные задания на активного студента"><BarChart data={completed} layout="vertical" margin={{ right: 20 }}>{grid}<XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" width={62} {...axis} />{tip}<Bar dataKey="perStudent" name="Заданий на студента" fill={chartColors[3]} radius={[0, 4, 4, 0]} maxBarSize={36} isAnimationActive={false} /></BarChart></Chart> : <Empty />}<Text size="xs" c="dimmed">Это средняя интенсивность практики, а не индивидуальный результат студента.</Text></Panel>
  </SimpleGrid></Stack>;
}
