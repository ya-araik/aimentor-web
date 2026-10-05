import { lazy, Suspense, useEffect, useState } from "react";
import {
  Alert,
  AppShell,
  Box,
  Button,
  Center,
  Group,
  Loader,
  NavLink,
  Stack,
  Text,
} from "@mantine/core";
import { IconBook2, IconLogout, IconMessageCircle2, IconUser, IconChartBar } from "@tabler/icons-react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ProfilePage } from "../features/auth/ProfilePage";
import { ChatPage } from "../features/chat/ChatPage";
import { SkillsPage } from "../features/skills/SkillsPage";
const DashboardPage = lazy(() => import("../features/admin/DashboardPage").then((module) => ({ default: module.DashboardPage })));

const demoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";

function FullPageLoading() {
  return (
    <Center mih="100vh">
      <Stack align="center" gap="xs">
        <Loader color="blue" />
        <Text c="dimmed">Загружаем кабинет…</Text>
      </Stack>
    </Center>
  );
}

function ProtectedRoute() {
  const auth = useAuth();
  if (!auth.token) return <Navigate to="/login" replace />;
  if (auth.loading) return <FullPageLoading />;
  if (auth.error) {
    return (
      <Center mih="100vh" p="md">
        <Alert title="Не удалось загрузить профиль" color="red" maw={420}>
          <Stack gap="sm">
            <Text size="sm">{auth.error.message}</Text>
            <Group>
              <Button size="xs" onClick={auth.retry}>Повторить</Button>
              <Button size="xs" variant="light" color="gray" onClick={auth.logout}>Выйти</Button>
            </Group>
          </Stack>
        </Alert>
      </Center>
    );
  }
  return <Outlet />;
}

function GuestRoute() {
  const auth = useAuth();
  if (auth.token) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RoleRoute({ role }: { role: string }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <Navigate to="/" replace />;
}

function HomeRoute() {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === "admin" ? "/dashboard" : user?.role === "student" ? "/chat" : "/profile"} replace />;
}

function AccountLayout() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const chatRoute = location.pathname === "/chat";
  const navigation = [
    ...(user?.role === "student" ? [
      { to: "/chat", label: "Чат", desktopLabel: "Чат и задания", Icon: IconMessageCircle2 },
      { to: "/skills", label: "Навыки", desktopLabel: "Навыки и прогресс", Icon: IconBook2 },
    ] : []),
    ...(user?.role === "admin" ? [{ to: "/dashboard", label: "Дашборд", desktopLabel: "Дашборд", Icon: IconChartBar }] : []),
    { to: "/profile", label: "Профиль", desktopLabel: "Профиль", Icon: IconUser },
  ];

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--app-top", `${viewport?.offsetTop ?? 0}px`);
      const editing = document.activeElement?.matches("input, textarea");
      setKeyboardOpen(Boolean(editing && viewport && window.innerHeight - viewport.height > 120));
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-top");
    };
  }, []);

  return (
    <AppShell
      className={`account-shell${chatRoute ? " account-shell-chat" : ""}${keyboardOpen ? " keyboard-open" : ""}`}
      header={{ height: 64 }}
      navbar={{ width: 232, breakpoint: "sm", collapsed: { mobile: true } }}
      padding={{ base: "md", sm: "xl" }}
    >
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Box className="brand-mark"><IconBook2 size={22} stroke={1.7} /></Box>
            <Box>
              <Text fw={650} lh={1.2}>ИИ Ментор</Text>
              <Text size="xs" c="dimmed">Учебная практика</Text>
            </Box>
          </Group>
          <Text size="sm" c="dimmed" visibleFrom="sm">{user?.role === "student" ? `Группа ${user.group || "не назначена"}` : user?.role === "admin" ? "Администратор" : "Преподаватель"}</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" className="app-navbar" visibleFrom="sm">
        <Stack justify="space-between" h="100%">
          <Stack gap="xs">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">Кабинет</Text>
            {navigation.map(({ to, desktopLabel, Icon }) => <NavLink key={to} component={Link} to={to} label={desktopLabel} leftSection={<Icon size={19} />} active={location.pathname === to} variant="light" />)}
          </Stack>
          <Stack gap="sm">
            <Box className="sidebar-account"><Text size="sm" fw={600} truncate>{user?.username}</Text><Text size="xs" c="dimmed">{user?.role === "student" ? "Студент" : user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : "Пользователь"}</Text></Box>
            {demoMode && <Alert color="yellow" variant="light" title="Демо-режим"><Text size="xs">Данные учебные, реальный сервер не подключён.</Text></Alert>}
            <Button leftSection={<IconLogout size={17} />} variant="subtle" color="gray" onClick={logout} fullWidth justify="flex-start">Выйти</Button>
          </Stack>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main className="app-main">
        <Box maw={1200} mx="auto" className="account-content">
          <Outlet />
          {user?.role !== "student" && user?.role !== "admin" && <Alert color="gray" mt="lg" title={user?.role === "teacher" ? "Кабинет преподавателя пока недоступен" : "Для этой роли доступен профиль"}>Сейчас вы можете посмотреть данные профиля. Дополнительные функции появятся после их подключения.</Alert>}
        </Box>
      </AppShell.Main>
      <nav className="mobile-nav" aria-label="Основная навигация">
        {navigation.map(({ to, label, Icon }) => <Link key={to} to={to} className="mobile-nav-link" aria-current={location.pathname === to ? "page" : undefined}><Icon size={22} stroke={1.7} aria-hidden="true" /><span>{label}</span></Link>)}
      </nav>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AccountLayout />}>
          <Route path="/" element={<HomeRoute />} />
          <Route element={<RoleRoute role="student" />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/skills" element={<SkillsPage />} />
          </Route>
          <Route element={<RoleRoute role="admin" />}>
            <Route path="/dashboard" element={<Suspense fallback={<Center py="xl"><Loader /></Center>}><DashboardPage /></Suspense>} />
          </Route>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  );
}
