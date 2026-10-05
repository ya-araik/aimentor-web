import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  SegmentedControl,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconArrowUp, IconRefresh, IconBook2 } from "@tabler/icons-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mentorApi, type Assessment, type ChatMessage } from "../../api/mentor";
import { useAuth } from "../../app/AuthProvider";
import { QueryError, QueryLoading } from "../../shared/ui/QueryMessage";
import { MentorText } from "../../shared/ui/MentorText";
import { completeTask, rememberTask, restoreTask } from "./task-session";
import { readDraft, readReplyMode, saveDraft, saveReplyMode } from "./chat-draft";

function messageTime(timestamp?: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function Message({ item }: { item: ChatMessage }) {
  const own = item.role === "user";
  return (
    <Box className={`chat-bubble ${own ? "chat-bubble-user" : "chat-bubble-ai"}`}>
      <Group gap="xs" mb={5}>
        <Text size="xs" fw={700}>{own ? "Вы" : "Ментор"}</Text>
        {item.question_id && <Badge size="xs" color="blue" variant="light">По заданию</Badge>}
        {messageTime(item.timestamp) && <Text size="xs" c="dimmed">{messageTime(item.timestamp)}</Text>}
      </Group>
      {own ? <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.content}</Text> : <MentorText>{item.content}</MentorText>}
    </Box>
  );
}

export function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskView = searchParams.get("view") === "task";
  const taskOpenedFromChat = useRef(false);
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ["history", 50], queryFn: () => mentorApi.getHistory(50) });
  const currentTask = useQuery({
    queryKey: ["currentTask"],
    queryFn: async () => restoreTask(user!.id, await mentorApi.getCurrentTask()),
    enabled: Boolean(user?.group),
    retry: false,
  });
  const [draft, setDraft] = useState(() => readDraft(user!.id));
  const [replyToTask, setReplyToTask] = useState(false);
  const [confirmNewTask, setConfirmNewTask] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [expandedTask, setExpandedTask] = useState(false);
  const historyElement = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => { saveDraft(user!.id, draft); }, [user!.id, draft]);

  function openTask() {
    taskOpenedFromChat.current = true;
    const next = new URLSearchParams(searchParams);
    next.set("view", "task");
    setSearchParams(next);
  }

  function closeTask() {
    if (taskOpenedFromChat.current) {
      taskOpenedFromChat.current = false;
      navigate(-1);
    } else {
      const next = new URLSearchParams(searchParams);
      next.delete("view");
      setSearchParams(next, { replace: true });
    }
  }

  function setMessageMode(reply: boolean) {
    setReplyToTask(reply);
    saveReplyMode(user!.id, currentTask.data?.question_id ?? null, reply);
  }

  useEffect(() => {
    setReplyToTask(readReplyMode(user!.id, currentTask.data?.question_id) ?? Boolean(currentTask.data));
    setExpandedTask(false);
  }, [currentTask.data?.question_id]);

  const startTask = useMutation({
    mutationFn: mentorApi.startTask,
    retry: false,
    onSuccess: (task) => {
      rememberTask(user!.id, task);
      queryClient.setQueryData(["currentTask"], task);
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      setReplyToTask(true);
      saveReplyMode(user!.id, task.question_id, true);
      setConfirmNewTask(false);
      setAssessment(null);
      setTaskCompleted(false);
      notifications.show({ color: "teal", message: "Новое задание готово" });
    },
  });

  const send = useMutation({
    mutationFn: mentorApi.sendChat,
    retry: false,
    onMutate: () => { followLatest.current = true; },
    onSuccess: (response, request) => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      if (response.task_completed === true || response.assessment != null) {
        const completedId = request.question_id ?? response.question_id;
        if (completedId) completeTask(user!.id, completedId);
        queryClient.setQueryData(["currentTask"], null);
        setReplyToTask(false);
        saveReplyMode(user!.id, null, false);
        setTaskCompleted(true);
        setAssessment(response.assessment ?? null);
        void queryClient.invalidateQueries({ queryKey: ["streak"] });
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["currentTask"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });

  useEffect(() => {
    const element = historyElement.current;
    if (element && followLatest.current) element.scrollTop = element.scrollHeight;
  }, [history.data, send.isPending, taskView]);

  function requestNewTask() {
    if (currentTask.data) setConfirmNewTask(true);
    else startTask.mutate();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || send.isPending || startTask.isPending) return;
    send.mutate({
      message,
      question_id: replyToTask && currentTask.data ? currentTask.data.question_id : null,
    });
  }

  return (
    <Stack gap="lg" className={`chat-page${taskView ? " chat-page-task" : ""}`}>
      <Group justify="space-between" align="center" className="page-heading chat-heading" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
        {taskView && <ActionIcon className="mobile-only" size="lg" variant="subtle" color="gray" aria-label="Вернуться в чат" onClick={closeTask}><IconArrowLeft size={22} /></ActionIcon>}
        <Box>
          <Title order={1} size="h2">{taskView ? "Практическое задание" : "Чат с ментором"}</Title>
          <Text size="sm" c="dimmed" mt={4} className="chat-subtitle">Практические задания и помощь по учебной программе</Text>
        </Box>
        </Group>
        {!taskView && <Button className="mobile-only" variant="light" size="sm" leftSection={<IconBook2 size={17} />} aria-label="Открыть задание" onClick={openTask}>Задание</Button>}
      </Group>

      <Box className="workspace-grid">
      <Stack gap="md" className="practice-column">
      <Box className="practice-scroll">
      <Stack gap="md">
      {!user?.group && <Alert color="orange" title="Группа не назначена">Для задания нужна учебная группа. Пока можно задавать ментору вопросы по теме.</Alert>}
      {currentTask.error && <QueryError error={currentTask.error} onRetry={() => void currentTask.refetch()} />}
      {startTask.error && <Alert color="red" title="Не удалось получить задание"><Stack gap="xs"><Text size="sm">{startTask.error.message}</Text><Text size="sm">Можно продолжить свободный диалог. Перед повторной попыткой проверьте, появилось ли задание.</Text><Button size="xs" variant="default" onClick={() => void currentTask.refetch()} loading={currentTask.isFetching}>Проверить задание</Button></Stack></Alert>}
      {taskCompleted && <Alert color="teal" title="Задание выполнено">
        <Stack gap="xs">
          {assessment && <Text size="sm">Уровень по результату оценки: {assessment.level}</Text>}
          {assessment?.feedback && <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{assessment.feedback}</Text>}
          <Anchor component={Link} to="/skills" size="sm">Посмотреть прогресс</Anchor>
        </Stack>
      </Alert>}

      {currentTask.data && (
        <Paper withBorder p="lg" className="task-panel">
          <Group justify="space-between" mb="md"><Text fw={600}>Текущее задание</Text><Badge color="blue" variant="light">В работе</Badge></Group>
          <Box style={{ maxHeight: expandedTask || taskView ? undefined : 180, overflow: "hidden" }}><MentorText>{currentTask.data.question}</MentorText></Box>
          {!taskView && (currentTask.data.question.length > 200 || currentTask.data.question.split("\n").length > 4) && <Button variant="subtle" size="xs" mt="xs" onClick={() => setExpandedTask((value) => !value)} aria-expanded={expandedTask}>{expandedTask ? "Свернуть задание" : "Показать задание целиком"}</Button>}
          <Divider my="md" />
          <Text size="sm" c="dimmed">Напишите решение в режиме «Ответ на задание». Если трудно, попросите подсказку в этом же режиме.</Text>
          <Button mt="md" variant="default" fullWidth onClick={requestNewTask} loading={startTask.isPending} disabled={send.isPending || currentTask.isFetching}>Новое задание</Button>
        </Paper>
      )}

      {!currentTask.data && <Paper withBorder p="lg" className="task-panel">
        <Group gap="xs" mb="sm"><IconBook2 size={19} /><Text fw={600}>Практическое задание</Text></Group>
        <Text size="sm" c="dimmed" mb="md">Ментор подберёт задание по одному из самых слабых навыков вашей учебной программы.</Text>
        <ol className="practice-steps"><li>Получите задание.</li><li>Напишите свой ответ в чате. Можно попросить подсказку.</li><li>Получите оценку и рекомендации для повторения.</li></ol>
        <Button fullWidth mt="lg" onClick={requestNewTask} loading={startTask.isPending} disabled={!user?.group || send.isPending || currentTask.isPending || currentTask.isError}>Получить задание</Button>
        <Anchor component={Link} to="/skills" size="sm" mt="md" display="block">Посмотреть учебные навыки</Anchor>
      </Paper>}
      <Text size="xs" c="dimmed">Навык выбирается автоматически. Прогресс появляется после оценки ответа на задание.</Text>
      </Stack>
      </Box>
      <Box className="mobile-only task-screen-footer"><Button fullWidth onClick={() => { if (currentTask.data) setMessageMode(true); closeTask(); }}>{currentTask.data ? "Ответить в чате" : "Вернуться в чат"}</Button></Box>
      </Stack>

      <Paper withBorder p={{ base: "md", sm: "lg" }} className="chat-card">
        <Group justify="space-between" mb="sm" className="chat-history-toolbar"><Text fw={600}>Диалог</Text><Button size="xs" variant="subtle" color="gray" leftSection={<IconRefresh size={15} />} onClick={() => void history.refetch()} loading={history.isFetching}>Обновить</Button></Group>
        <Divider className="chat-history-toolbar" />
        {taskCompleted && <Button className="mobile-only mobile-result" variant="light" color="teal" onClick={openTask}>Результат задания{assessment ? ` · ${assessment.level}` : ""}</Button>}
        <Box className="chat-list" role="log" aria-label="История диалога" ref={historyElement} onScroll={() => {
          const element = historyElement.current;
          if (element) followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
        }}>
          {history.isPending && <QueryLoading label="Загружаем сообщения…" />}
          {history.error && <QueryError error={history.error} onRetry={() => void history.refetch()} />}
          {history.data?.messages.length === 0 && (
            <Stack align="center" justify="center" gap="sm" className="chat-empty">
              <Text fw={600}>Диалог пока пуст</Text>
              <Text size="sm" c="dimmed" ta="center" maw={360}>{currentTask.data ? "Напишите свой ответ или попросите ментора помочь разобраться с заданием." : "Получите практическое задание или задайте вопрос по теме, которую хотите понять."}</Text>
              {!currentTask.data && <Button className="mobile-only" size="sm" onClick={openTask}>Начать практику</Button>}
              <Text size="xs" c="dimmed">Можно начать так:</Text>
              <Stack gap="xs" maw={360} w="100%">
                {(currentTask.data ? ["Помоги разобраться с условием задания", "Дай подсказку, с чего начать"] : ["Объясни разницу между ИИ и машинным обучением", "Как лучше изучать новую тему?"]).map((prompt) => <Button key={prompt} className="prompt-button" variant="default" size="xs" onClick={() => setDraft(prompt)}>{prompt}</Button>)}
              </Stack>
            </Stack>
          )}
          {history.data && history.data.messages.length > 0 && (
            <Stack gap="sm">
              {history.data.messages.map((item) => <Message item={item} key={item.id} />)}
            </Stack>
          )}
          {send.isPending && <Group gap="xs" mt="md" c="dimmed"><Loader size="xs" /><Text size="sm">Ментор думает над ответом…</Text></Group>}
        </Box>
        <Divider />
        {send.error && <Alert color="red" mt="sm" title="Сообщение не подтверждено сервером">{send.error.message} Проверьте историю перед повторной отправкой.</Alert>}
        <form onSubmit={submit} className="chat-composer">
          <Stack gap="sm" pt="md">
            {currentTask.data && <SegmentedControl aria-label="Режим сообщения" fullWidth value={replyToTask ? "task" : "question"} onChange={(value) => setMessageMode(value === "task")} data={[{ value: "task", label: "Ответ на задание" }, { value: "question", label: "Вопрос ментору" }]} />}
            <Text size="xs" c="dimmed" className="composer-help">{replyToTask && currentTask.data ? "Сообщение относится к текущему заданию: решение, уточнение или просьба о подсказке." : "Свободный вопрос по теме. Для оценки навыка нужно выполнить практическое задание."}</Text>
            <Textarea
              aria-label="Сообщение ментору"
              placeholder={replyToTask && currentTask.data ? "Ваше решение или вопрос по заданию…" : "Что вы хотите понять или разобрать?"}
              autosize
              minRows={1}
              maxRows={5}
              maxLength={4000}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">{draft.length} / 4000</Text>
              <Button type="submit" rightSection={<IconArrowUp size={17} />} loading={send.isPending} disabled={!draft.trim() || startTask.isPending}>Отправить</Button>
            </Group>
          </Stack>
        </form>
      </Paper>
      </Box>

      <Modal opened={confirmNewTask} onClose={() => setConfirmNewTask(false)} title="Создать ещё одно задание?" centered>
        <Stack gap="lg">
          <Text size="sm">У вас уже есть задание в работе. Если получить новое, следующие ответы будут относиться к нему. Предыдущая переписка останется в истории.</Text>
          <Group justify="flex-end"><Button variant="default" onClick={() => setConfirmNewTask(false)}>Отмена</Button><Button onClick={() => startTask.mutate()} loading={startTask.isPending}>Создать</Button></Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
