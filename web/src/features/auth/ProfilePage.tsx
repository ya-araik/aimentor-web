import { Badge, Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useAuth } from "../../app/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { mentorApi } from "../../api/mentor";
import { QueryError } from "../../shared/ui/QueryMessage";

function displayName(username: string, ...parts: string[]): string {
  return parts.filter(Boolean).join(" ") || username;
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const streak = useQuery({ queryKey: ["streak"], queryFn: mentorApi.getStreak, enabled: user?.role === "student" });
  if (!user) return null;

  return (
    <Stack gap="lg">
      <Box className="page-heading">
        <Title order={1} size="h2">Профиль</Title>
        <Text size="sm" c="dimmed" mt={4}>Учётная запись и учебная группа</Text>
      </Box>
      <Paper p="xl" radius="lg" withBorder maw={650}>
        <Stack gap="lg">
          <Box>
            <Text size="sm" c="dimmed">{user.role === "student" ? "Студент" : user.role === "admin" ? "Администратор" : user.role === "teacher" ? "Преподаватель" : user.role}</Text>
            <Title order={2} size="h3" style={{ overflowWrap: "anywhere" }}>{displayName(user.username, user.last_name, user.first_name, user.middle_name)}</Title>
          </Box>
          <Group justify="space-between"><Text c="dimmed">Логин</Text><Text fw={600} style={{ overflowWrap: "anywhere" }}>{user.username}</Text></Group>
          <Group justify="space-between"><Text c="dimmed">Учебная группа</Text><Badge size="lg" color="gray" variant="light">{user.group || "Не назначена"}</Badge></Group>
          {user.role === "student" && user.group && <Text size="sm" c="dimmed">Группа определяет учебную программу и доступные навыки.</Text>}
          {!user.group && user.role === "student" && <Text size="sm" c="orange">Для получения практических заданий нужна учебная группа.</Text>}
          {user.role === "student" && <>
            <Group justify="space-between"><Text c="dimmed">Серия дней</Text><Text fw={600}>{streak.data?.current_streak ?? user.current_streak}</Text></Group>
            <Group justify="space-between"><Text c="dimmed">Рекорд серии</Text><Text fw={600}>{streak.data?.longest_streak ?? user.longest_streak}</Text></Group>
            {streak.error && <QueryError error={streak.error} onRetry={() => void streak.refetch()} />}
          </>}
          <Button leftSection={<IconLogout size={18} />} variant="light" color="gray" onClick={logout} mt="sm">Выйти из аккаунта</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
