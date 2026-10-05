import { useMemo, useState } from "react";
import { Alert, Box, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import type { AdminStats } from "../../api/mentor";
import { buildGroups, dayTime, longDate, number } from "./analytics";
import { calendarSurface, skillDistributionSurface } from "./surface-data";
import { SurfacePlot } from "./SurfacePlot";
import { Empty } from "./ChartPanel";
import "./surface.css";

export function ThreeDCharts({ data, days, updatedAt }: { data: AdminStats; days: number; updatedAt: number }) {
  const [group, setGroup] = useState("all");
  const groups = useMemo(() => buildGroups(data), [data]);
  const selectedGroup = groups.some((item) => String(item.id) === group) ? group : "all";
  const calendar = useMemo(() => calendarSurface(data, selectedGroup), [data, selectedGroup]);
  const distribution = useMemo(() => skillDistributionSurface(data.avg_progress_by_skill), [data]);
  const start = calendar.points[0]?.key;
  const end = calendar.points.at(-1)?.key;
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const outsideWindow = data.daily_activity.some((item) => dayTime(item.day) > dayTime(todayString) || dayTime(item.day) < dayTime(todayString) - (days-1)*86_400_000);
  return <Stack gap="lg">
    <Box><Title order={2} size="h3">Объёмные рельефы</Title><Text size="sm" c="dimmed" mt={4}>Пики показывают, где сосредоточены активность и навыки. Поверните поверхность, чтобы рассмотреть её с другой стороны.</Text></Box>
    <Group justify="space-between" align="flex-end"><Text size="sm" c="dimmed">{start && end ? `Даты в ответе: ${longDate(start)} — ${longDate(end)} · ${number(calendar.total)} сообщений` : "Для выбранной группы нет ежедневных записей"}</Text><Select label="Группа в календарном рельефе" value={selectedGroup} onChange={(value) => setGroup(value ?? "all")} allowDeselect={false} data={[{ value: "all", label: "Все группы" }, ...groups.map((item) => ({ value: String(item.id), label: item.name }))]} w={260} maw="100%" /></Group>
    {(outsideWindow || calendar.invalidCount > 0) && <Alert color="yellow" title="Проверка дат">{outsideWindow && "Сервер вернул даты за пределами выбранного периода, включая старые или будущие. Показаны фактические записи API."}{calendar.invalidCount > 0 && ` Записей с некорректной датой исключено: ${calendar.invalidCount}.`}</Alert>}
    {calendar.points.length ? <SurfacePlot key={`calendar-${selectedGroup}-${updatedAt}`} id="calendar" title="Рельеф учебной активности" description="Неделя × день недели × количество сообщений. Высокие участки — дни с большим количеством сообщений в чате." model={calendar} /> : <Paper withBorder p="lg"><Title order={3} size="h4">Рельеф учебной активности</Title><Empty /></Paper>}
    <Text size="xs" c="dimmed">Пропуски записей — разрывы поверхности. Нулевое значение показывается только там, где сервер явно вернул 0. Фильтр группы и период относятся к календарному рельефу.</Text>
    {distribution.invalidCount > 0 && <Alert color="yellow" title="Некорректные значения навыков">Навыков с некорректным процентом или числом студентов исключено: {distribution.invalidCount}.</Alert>}
    {distribution.total ? <SurfacePlot key={`distribution-${updatedAt}`} id="distribution" title="Рельеф распределения навыков" description={`Освоение × число студентов с оценкой × количество навыков. Всего ${number(distribution.total)} навыков; каждый учтён один раз. Диапазон освоения — 5 процентных пунктов.`} model={distribution} /> : <Paper withBorder p="lg"><Title order={3} size="h4">Рельеф распределения навыков</Title><Empty /></Paper>}
    <Paper withBorder p="md"><Text size="sm" fw={600}>Как читать поверхность</Text><Text size="sm" c="dimmed" mt={5}>Точки показывают исходные числа. Поверхность между точками — визуальная интерполяция, промежуточные значения не являются отдельными измерениями. В рельефе навыков высота означает число навыков в диапазоне, а не оценку студента.</Text><Text size="xs" c="dimmed" mt={8}>Это учебная аналитика по сводке API. Данных об обучении нейросети, функции потерь и шагах градиентного спуска сервер не предоставляет.</Text></Paper>
  </Stack>;
}
