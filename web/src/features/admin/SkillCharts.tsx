import { useMemo, useState } from "react";
import { Box, Group, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { Bar, BarChart, Cell, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import type { AdminStats } from "../../api/mentor";
import { buildSkills, chartColors, number, skillColor } from "./analytics";
import { axis, Chart, Empty, grid, Panel, tip } from "./ChartPanel";

export function SkillCharts({ data }: { data: AdminStats }) {
  const [sort, setSort] = useState("weak");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const skills = useMemo(() => [...data.avg_progress_by_skill].filter((item) => item.skill.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))).sort((a, b) => sort === "coverage" ? b.students_count - a.students_count : sort === "strong" ? b.avg_level - a.avg_level : a.avg_level - b.avg_level), [data, search, sort]);
  const summary = buildSkills(data.avg_progress_by_skill);
  const min = Math.min(...data.avg_progress_by_skill.map((item) => item.avg_level));
  const max = Math.max(...data.avg_progress_by_skill.map((item) => item.avg_level));
  const selectedSkill = data.avg_progress_by_skill.find((item) => item.skill_id === selected);
  const weakIds = new Set(data.weakest_skills.map((item) => item.skill_id));
  const rank = skills.map((item, index) => ({ ...item, label: `${index + 1}. ${item.skill.length > 28 ? item.skill.slice(0, 28) + "…" : item.skill}` }));
  return <Stack gap="lg"><Box><Title order={2} size="h3">Освоение программы</Title><Text size="sm" c="dimmed" mt={4}>Средние оценки по навыкам, без фильтра по периоду или группе.</Text></Box>
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg"><Panel title="Распределение освоения" description="Сколько навыков попало в каждый диапазон средней оценки. Это распределение навыков, а не студентов.">{data.avg_progress_by_skill.length ? <Chart label="Количество навыков по диапазонам освоения"><BarChart data={summary.histogram} margin={{ left: -20, right: 8 }}>{grid}<XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} />{tip}<Bar dataKey="count" name="Навыков" fill={chartColors[1]} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} /></BarChart></Chart> : <Empty />}</Panel>
    <Panel title="Освоение и охват" description="Точка — навык. По горизонтали — студенты с оценкой, по вертикали — среднее освоение (%).">{data.avg_progress_by_skill.length ? <Chart label="Связь охвата и среднего освоения навыков"><ScatterChart margin={{ top: 12, right: 18, left: -18, bottom: 4 }}>{grid}<XAxis type="number" dataKey="students_count" name="Студентов" allowDecimals={false} domain={["dataMin - 1", "dataMax + 1"]} {...axis} /><YAxis type="number" dataKey="avg_level" name="Освоение" unit="%" domain={[0, 100]} {...axis} /><ReferenceLine y={summary.mean ?? 0} stroke="#b7c5d5" strokeDasharray="5 5" />{tip}<Scatter name="Навык" data={data.avg_progress_by_skill} fill={chartColors[0]} isAnimationActive={false}>{data.avg_progress_by_skill.map((item) => <Cell key={item.skill_id} fill={weakIds.has(item.skill_id) ? chartColors[2] : chartColors[0]} />)}</Scatter></ScatterChart></Chart> : <Empty />}<Text size="xs" c="dimmed">Золотые точки — топ-5 слабых навыков из API. Пунктир — среднее по навыкам.</Text></Panel></SimpleGrid>
    <Panel title="Тепловая карта навыков" description="Каждая карточка — навык. Цвет сравнивает навыки между собой, длина полосы — оценка по шкале 0–100%.">
      <Group mb="lg" justify="space-between"><TextInput leftSection={<IconSearch size={16} />} aria-label="Поиск навыка" placeholder="Найти навык" value={search} onChange={(event) => setSearch(event.currentTarget.value)} className="skill-search" /><SegmentedControl aria-label="Сортировка навыков" value={sort} onChange={setSort} data={[{ value: "weak", label: "Слабые" }, { value: "strong", label: "Сильные" }, { value: "coverage", label: "Охват" }]} size="xs" /></Group>
      {data.avg_progress_by_skill.length > 0 && <Group gap={6} mb="md" className="heat-legend"><Text size="xs" c="dimmed">Слабее · {number(min)}%</Text>{[0, .25, .5, .75, 1].map((ratio) => <span key={ratio} style={{ background: skillColor(min + (max - min) * ratio, min, max) }} />)}<Text size="xs" c="dimmed">{number(max)}% · сильнее</Text></Group>}
      {skills.length ? <div className="skill-heat-grid">{skills.map((item) => <button key={item.skill_id} type="button" className="skill-tile" aria-pressed={selected === item.skill_id} onClick={() => setSelected(item.skill_id)} style={{ background: `${skillColor(item.avg_level, min, max)}18`, borderLeft: `3px solid ${skillColor(item.avg_level, min, max)}` }}><div className="skill-tile-top"><strong>{number(item.avg_level)}<span>%</span></strong>{weakIds.has(item.skill_id) && <span className="skill-attention">В топ-5 слабых</span>}</div><span className="skill-tile-name">{item.skill}</span><span className="skill-tile-track"><span style={{ width: `${Math.min(100, Math.max(0, item.avg_level))}%`, background: skillColor(item.avg_level, min, max) }} /></span><span className="skill-tile-count">Студентов с оценкой: {number(item.students_count)}</span></button>)}</div> : <Empty text={search ? "По этому запросу навыков нет." : "Пока нет оценённых навыков."} />}
      {selectedSkill && <div className="heat-selection"><Text fw={600}>{selectedSkill.skill}</Text><Text size="sm">Среднее освоение: {number(selectedSkill.avg_level)}% · Студентов с оценкой: {number(selectedSkill.students_count)}</Text></div>}
    </Panel>

    <Panel title="Рейтинг навыков" description="Та же сортировка и поиск, что на карте. Наведите или нажмите на полосу, чтобы увидеть полное название.">
      {rank.length ? <div className="skill-ranking-scroll"><Chart label="Рейтинг среднего освоения по навыкам" height={Math.max(230, rank.length * 42)}><BarChart data={rank} layout="vertical" margin={{ left: 0, right: 25 }}>{grid}<XAxis type="number" domain={[0, 100]} unit="%" {...axis} /><YAxis type="category" dataKey="label" width={125} interval={0} {...axis} />{tip}<Bar dataKey="avg_level" name="Освоение" radius={[0, 4, 4, 0]} maxBarSize={19} isAnimationActive={false}>{rank.map((item) => <Cell key={item.skill_id} fill={weakIds.has(item.skill_id) ? chartColors[2] : chartColors[0]} />)}</Bar></BarChart></Chart></div> : <Empty />}
    </Panel>
  </Stack>;
}
