import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { IconBook2 } from "@tabler/icons-react";
import { mentorApi } from "../../api/mentor";
import { useAuth } from "../../app/AuthProvider";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const login = useMutation({ mutationFn: mentorApi.login, retry: false });
  const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    try {
      const result = await login.mutateAsync({ username: username.trim(), password });
      auth.login(result);
      navigate("/", { replace: true });
    } catch {
      // Сообщение об ошибке выводится из состояния мутации.
    }
  }

  return (
    <Box className="auth-page">
      <Paper p={{ base: "lg", sm: "xl" }} radius="lg" className="auth-card">
        <Stack gap="lg">
          <Group gap="sm"><Box className="brand-mark"><IconBook2 size={22} stroke={1.7} /></Box><Text fw={650}>ИИ Ментор</Text></Group>
          <Box>
            <Title order={1} size="h2">Вход в кабинет</Title>
            <Text c="dimmed" size="sm" mt={6}>Практические задания, помощь ментора и прогресс по учебной программе.</Text>
          </Box>
          {searchParams.get("registered") === "1" && <Alert color="green">Аккаунт создан. Теперь войдите.</Alert>}
          {demoMode && <Alert color="yellow" title="Демо-режим">Студент: <b>student / student123</b>. Администратор: <b>admin / admin123</b>. Данные учебные.</Alert>}
          {login.error && <Alert color="red" title="Не удалось войти">{login.error.message}</Alert>}
          <form onSubmit={submit}>
            <Stack>
              <TextInput label="Логин" autoComplete="username" required value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
              <PasswordInput label="Пароль" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
              <Button type="submit" fullWidth loading={login.isPending}>Войти</Button>
            </Stack>
          </form>
          <Text size="sm" ta="center" c="dimmed">Ещё нет аккаунта? <Link to="/register">Зарегистрироваться</Link></Text>
        </Stack>
      </Paper>
    </Box>
  );
}
