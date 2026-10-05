import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";

export function QueryLoading({ label = "Загружаем данные…" }: { label?: string }) {
  return (
    <Group gap="sm" py="xl" c="dimmed">
      <Loader size="sm" />
      <Text size="sm">{label}</Text>
    </Group>
  );
}

export function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Alert color="red" title="Не удалось загрузить данные">
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{error.message}</Text>
        <Button size="xs" variant="light" color="red" onClick={onRetry}>Повторить</Button>
      </Stack>
    </Alert>
  );
}
