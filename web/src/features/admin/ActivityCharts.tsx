import { useMemo, useState } from "react";
import { Alert, Box, Group, Paper, Select, Stack, Text, Title, Tooltip as Hint } from "@mantine/core";
import { Area, AreaChart, Bar, BarChart, XAxis, YAxis } from "recharts";
import type { AdminStats } from "../../api/mentor";
import { buildActivity, buildGroups, chartColors, dayTime, heatColor, longDate, number, shortDate } from "./analytics";
import { axis, Chart, Empty, grid, Panel, tip } from "./ChartPanel";

export function ActivityCharts({ data, days }: { data: AdminStats; days: number }) {
  const [group, setGroup] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const groups = useMemo(() => buildGroups(data), [data]);
  const selectedGroup = groups.some((item) => String(item.id) === group) ? group : "all";
  const activity = useMemo(() => buildActivity(data, selectedGroup), [data, selectedGroup]);
  const allActivity = useMemo(() => buildActivity(data), [data]);
  const start = allActivity.dates[0];
  const end = allActivity.dates.at(-1);
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const outsideWindow = allActivity.observed.some((day) => dayTime(day) > dayTime(todayString) || dayTime(day) < dayTime(todayString) - (days - 1) * 86_400_000);
  const invalid = data.daily_activity.some((row) => !Number.isFinite(dayTime(row.day)));
  const visibleGroups = selectedGroup === "all" ? groups : groups.filter((item) => String(item.id) === selectedGroup);
  const max = Math.max(1, ...[...activity.values.values()].flatMap((values) => [...values.values()]));
  return <Stack gap="lg">
    <Group justify="space-between" align="flex-end"><Box><Title order={2} size="h3">Учебная активность</Title><Text size="sm" c="dimmed" mt={4}>{start && end ? `Даты в ответе: ${longDate(start)} — ${longDate(end)}` : "За выбранный период нет записей"}</Text></Box><Select label="Группа в графиках активности" value={selectedGroup} onChange={(value) => { setGroup(value ?? "all"); setSelectedDay(null); }} data={[{ value: "all", label: "Все группы" }, ...groups.map((item) => ({ value: String(item.id), label: item.name }))]} allowDeselect={false} w={240} /></Group>
    {(outsideWindow || invalid) && <Alert color="yellow" title="Даты за пределами периода">{outsideWindow && "В ответе есть даты за пределами выбранного периода, включая старые или будущие. Графики показывают фактические записи сервера."}{invalid && " Записи с некорректной датой не включены в графики."}</Alert>}
    <div className="analytics-trend-grid">
      <Panel title="Сообщения по дням" description="Сумма по выбранным группам. Разрывы линии — дни без записи.">
        {activity.observed.length ? <Chart label="Динамика количества сообщений" height={280}><AreaChart data={activity.daily} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>{grid}<XAxis dataKey="day" tickFormatter={shortDate} minTickGap={35} {...axis} /><YAxis allowDecimals={false} {...axis} />{tip}<Area dataKey="messages" name="Сообщения" type="linear" stroke={chartColors[0]} fill="#dbe8f4" strokeWidth={2} dot={activity.observed.length <= 2 ? { r: 4, fill: chartColors[0] } : false} connectNulls={false} isAnimationActive={false} /></AreaChart></Chart> : <Empty />}
      </Panel>
      <Paper withBorder p="lg" className="analytics-highlights"><Text size="xs" fw={700} c="dimmed" tt="uppercase">По полученным записям</Text><div><Text size="sm" c="dimmed">Всего сообщений</Text><Text className="analytics-big">{number(activity.total)}</Text></div><div><Text size="sm" c="dimmed">Среднее за день с данными</Text><Text size="xl" fw={650}>{activity.average === null ? "—" : number(activity.average)}</Text><Text size="xs" c="dimmed">Дней с записью: {activity.observed.length}</Text></div><div><Text size="sm" c="dimmed">Самый активный день</Text><Text size="xl" fw={650}>{activity.peak ? shortDate(activity.peak.day) : "—"}</Text><Text size="xs" c="dimmed">{activity.peak ? `${number(activity.peak.messages!)} сообщений · ${activity.peak.day.slice(0, 4)}` : "Нет данных"}</Text></div></Paper>
    </div>
    <Panel title="Тепловая карта активности" description="Строка — группа, столбец — дата. Нажмите ячейку для подробностей; по горизонтали можно прокручивать.">
      {activity.dates.length && visibleGroups.length ? <><div className="activity-heat-scroll" tabIndex={0} role="region" aria-label="Тепловая карта сообщений по группам и датам"><div className="activity-heat-grid" style={{ gridTemplateColumns: `92px repeat(${activity.dates.length}, 24px)` }}><span />{activity.dates.map((day, index) => <span key={day} className="heat-date">{index === 0 || day.endsWith("-01") || index % 7 === 0 ? shortDate(day) : ""}</span>)}{visibleGroups.map((item) => <div key={item.id} className="heat-row"><span className="heat-group">{item.name}</span>{activity.dates.map((day) => { const value = activity.values.get(day)?.get(item.id) ?? null; const label = `${item.name} · ${longDate(day)}: ${value === null ? "нет записи" : `${number(value)} сообщений`}`; return <Hint key={day} label={label} withArrow><button type="button" className="heat-cell" style={{ background: heatColor(value, max) }} aria-label={label} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)} /></Hint>; })}</div>)}</div></div><Group gap={6} mt="md" className="heat-legend"><Text size="xs" c="dimmed">Нет записи</Text><span style={{ background: heatColor(null, max) }} /><Text size="xs" c="dimmed" ml={8}>0</Text>{[0, .25, .5, .75, 1].map((ratio) => <span key={ratio} style={{ background: heatColor(ratio * max, max) }} />)}<Text size="xs" c="dimmed">{number(max)} сообщений</Text></Group><Text size="xs" c="dimmed" mt={8}>Серые ячейки означают отсутствие записи, а не отсутствие сообщений.</Text>{selectedDay && <div className="heat-selection"><Text size="sm" fw={600}>{longDate(selectedDay)}</Text>{visibleGroups.map((item) => <Text size="sm" key={item.id}>{item.name}: {activity.values.get(selectedDay)?.has(item.id) ? `${number(activity.values.get(selectedDay)!.get(item.id)!)} сообщений` : "нет записи"}</Text>)}</div>}</> : <Empty />}
    </Panel>
    <Panel title="Ритм недели" description="Среднее число сообщений в день недели. Делим только на количество дней, для которых есть запись.">
      {activity.observed.length ? <Chart label="Средняя активность по дням недели" height={220}><BarChart data={activity.weekdays} margin={{ left: -20, right: 8 }}>{grid}<XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} />{tip}<Bar dataKey="average" name="Сообщений в среднем" fill={chartColors[1]} radius={[4, 4, 0, 0]} maxBarSize={52} isAnimationActive={false} /></BarChart></Chart> : <Empty />}
    </Panel>
  </Stack>;
}
