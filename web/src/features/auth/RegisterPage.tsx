import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { IconBook2 } from "@tabler/icons-react";
import { mentorApi } from "../../api/mentor";
import { QueryError, QueryLoading } from "../../shared/ui/QueryMessage";

export function RegisterPage() {
  const navigate = useNavigate();
  const groups = useQuery({ queryKey: ["groups"], queryFn: mentorApi.getGroups });
  const register = useMutation({ mutationFn: mentorApi.register, retry: false });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (username.trim().length < 3 || username.trim().length > 32) {
      setFormError("Логин должен содержать от 3 до 32 символов.");
      return;
    }
    if (password.length < 8) {
      setFormError("Пароль должен содержать не меньше 8 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Пароли не совпадают.");
      return;
    }
    if (!groupId) {
      setFormError("Выберите учебную группу.");
      return;
    }
    try {
      await register.mutateAsync({
        username: username.trim(),
        password,
        role: "student",
        group_id: Number(groupId),
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
      });
      navigate("/login?registered=1", { replace: true });
    } catch {
      // Сообщение об ошибке выводится из состояния мутации.
    }
  }

  return (
    <Box className="auth-page">
      <Paper p={{ base: "lg", sm: "xl" }} radius="lg" className="auth-card">
        <Stack gap="md">
          <Group gap="sm"><Box className="brand-mark"><IconBook2 size={22} stroke={1.7} /></Box><Text fw={650}>ИИ Ментор</Text></Group>
          <Box>
            <Title order={1} size="h2">Создать аккаунт</Title>
            <Text c="dimmed" size="sm" mt={6}>Регистрация студента. Учебная группа определяет программу и доступные навыки.</Text>
          </Box>
          {formError && <Alert color="red">{formError}</Alert>}
          {register.error && <Alert color="red" title="Не удалось зарегистрироваться">{register.error.message}</Alert>}
          {groups.isPending && <QueryLoading label="Загружаем группы…" />}
          {groups.error && <QueryError error={groups.error} onRetry={() => void groups.refetch()} />}
          {groups.data?.length === 0 && <Alert color="orange">Нет доступных учебных групп. Регистрация станет доступна, когда группы появятся.</Alert>}
          <form onSubmit={submit}>
            <Stack gap="sm">
              <TextInput label="Логин" required minLength={3} maxLength={32} autoComplete="username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
              <PasswordInput label="Пароль" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
              <PasswordInput label="Повторите пароль" required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
              <Select label="Учебная группа" placeholder="Выберите из списка" required searchable data={(groups.data ?? []).map((item) => ({ value: String(item.id), label: item.name }))} value={groupId} onChange={setGroupId} disabled={!groups.data?.length} />
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Имя" value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} />
                <TextInput label="Фамилия" value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} />
              </SimpleGrid>
              <TextInput label="Отчество" value={middleName} onChange={(event) => setMiddleName(event.currentTarget.value)} />
              <Button type="submit" mt="xs" loading={register.isPending} disabled={!groups.data?.length}>Зарегистрироваться</Button>
            </Stack>
          </form>
          <Text size="sm" ta="center" c="dimmed">Уже есть аккаунт? <Link to="/login">Войти</Link></Text>
        </Stack>
      </Paper>
    </Box>
  );
}
