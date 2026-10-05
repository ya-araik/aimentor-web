import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { mentorApi } from "../../api/mentor";
import { QueryError, QueryLoading } from "../../shared/ui/QueryMessage";
import { Link } from "react-router";

export function SkillsPage() {
  const skills = useQuery({ queryKey: ["skills"], queryFn: mentorApi.getSkills });
  const progress = useQuery({ queryKey: ["progress"], queryFn: mentorApi.getProgress });
  const levelBySkillId = new Map((progress.data ?? []).map((item) => [item.skill_id, item.level]));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" className="page-heading">
        <Box>
          <Title order={1} size="h2">Навыки и прогресс</Title>
          <Text size="sm" c="dimmed" mt={4}>Учебная программа вашей группы и результаты практики</Text>
        </Box>
        <Button size="sm" variant="light" leftSection={<IconRefresh size={17} />} loading={progress.isFetching} onClick={() => void progress.refetch()}>Обновить прогресс</Button>
      </Group>

      <Text size="sm" c="dimmed">Навыки заданы учебной программой. Ментор автоматически выбирает тему задания с учётом вашего прогресса.</Text>
      {(skills.isPending || progress.isPending) && <QueryLoading />}
      {skills.error && <QueryError error={skills.error} onRetry={() => void skills.refetch()} />}
      {progress.error && <QueryError error={progress.error} onRetry={() => void progress.refetch()} />}

      {!skills.isPending && !progress.isPending && !skills.error && !progress.error && (
        <Tabs defaultValue={progress.data?.length ? "progress" : "catalog"} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="catalog">Каталог навыков</Tabs.Tab>
            <Tabs.Tab value="progress">Мой прогресс</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="progress" pt="lg">
            {progress.data?.length === 0 ? (
              <Paper withBorder p="xl"><Text fw={600}>Пока нет оценённых навыков</Text><Text c="dimmed" size="sm" mt="xs">После регистрации это нормально. Получите практическое задание, отправьте свой ответ и дождитесь оценки ментора.</Text><Button component={Link} to="/chat" mt="lg" variant="default">Перейти к практике</Button></Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {progress.data?.map((item) => (
                  <Paper key={item.skill_id} withBorder radius="lg" p="lg">
                    <Group justify="space-between" align="flex-start" wrap="nowrap"><Text fw={600}>{item.skill}</Text><Badge variant="light" color="blue">{item.level}%</Badge></Group>
                    <Progress value={item.level} mt="lg" size="lg" radius="xl" aria-label={`Освоение навыка ${item.skill}: ${item.level}%`} />
                    {item.weaknesses && <Text size="sm" c="dimmed" mt="md" style={{ whiteSpace: "pre-wrap" }}>Стоит повторить: {item.weaknesses}</Text>}
                  </Paper>
                ))}
              </SimpleGrid>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="catalog" pt="lg">
            <Text size="sm" c="dimmed" mb="md">{skills.data?.length ? `${skills.data.length} навыков по вашему курсу и специальности. «Нет оценки» означает, что результат практики ещё не получен.` : "Навыки по вашему курсу и специальности."}</Text>
            {skills.data?.length === 0 ? <Paper withBorder p="xl"><Text fw={600}>Для вашей группы пока нет доступных навыков</Text><Text size="sm" c="dimmed" mt="xs">Учебная программа пока недоступна. Сообщите преподавателю или администратору название группы. До её настройки можно задавать ментору вопросы в свободном чате.</Text><Button component={Link} to="/chat" variant="default" mt="lg">Открыть чат</Button></Paper> : (
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {skills.data?.map((skill) => (
                  <Paper key={skill.id} withBorder radius="lg" p="lg">
                    <Group justify="space-between" align="flex-start" wrap="nowrap"><Text fw={600}>{skill.name}</Text><Badge color={levelBySkillId.has(skill.id) ? "blue" : "gray"} variant="light">{levelBySkillId.has(skill.id) ? `${levelBySkillId.get(skill.id)}%` : "Нет оценки"}</Badge></Group>
                    {skill.description && <Text size="sm" c="dimmed" mt="sm">{skill.description}</Text>}
                  </Paper>
                ))}
              </SimpleGrid>
            )}
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
