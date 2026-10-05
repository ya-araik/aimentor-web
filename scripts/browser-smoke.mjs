import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Запуск на согласованном тестовом окружении. Использует существующие QA-аккаунты,
// Мутации только по флагам: --exercise-chat (сообщение), --exercise-registration
// (один QA-студент, доступ сохраняется локально). Задания не создаёт.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const accounts = JSON.parse(await readFile(path.join(root, ".local/integration-accounts.json"), "utf8"));
const base = process.env.WEB_URL || "http://localhost:8080";
const artifacts = path.join(root, ".local/browser-smoke");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { at: new Date().toISOString(), base, checks: [], errors: [] };

function check(name, passed) {
  report.checks.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) throw new Error(name);
}
async function noOverflow(page, name) {
  check(name, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}
async function login(page, role) {
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel(/^Логин/).fill(accounts[role].username);
  await page.getByLabel(/^Пароль/).fill(accounts[role].password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("heading", { name: role === "admin" ? "Дашборд" : "Чат с ментором", exact: true }).waitFor();
  check(`Вход ${role} через UI`, true);
}

try {
  if (process.argv.includes("--exercise-registration")) {
    if (!accounts.registered) {
      const registered = { username: `qa_register_${Date.now().toString(36)}`, password: randomBytes(20).toString("base64url") };
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${base}/register`);
      await page.getByLabel(/^Логин/).fill(registered.username);
      await page.getByLabel(/^Пароль/).fill(registered.password);
      await page.getByLabel(/^Повторите пароль/).fill(registered.password);
      await page.getByRole("combobox", { name: /^Учебная группа/ }).click();
      await page.getByRole("option").first().click();
      await noOverflow(page, "Мобильная регистрация: нет переполнения");
      const response = page.waitForResponse((r) => r.url().endsWith("/api/register") && r.request().method() === "POST").catch(() => null);
      await page.getByRole("button", { name: "Зарегистрироваться", exact: true }).click();
      const result = await response;
      check("Регистрация студента через UI", result?.status() === 201);
      check("Форма не назначает повышенную роль", result.request().postDataJSON().role === "student");
      accounts.registered = registered;
      await writeFile(path.join(root, ".local/integration-accounts.json"), JSON.stringify(accounts, null, 2));
      await page.getByText("Аккаунт создан. Теперь войдите.", { exact: true }).waitFor();
      await login(page, "registered");
      await page.getByText("Диалог пока пуст", { exact: true }).waitFor();
      check("Новый студент получает пустой диалог", true);
      await page.screenshot({ path: path.join(artifacts, "new-student-mobile.png") });
      await context.close();
    } else {
      console.log("SKIP повторное создание QA-студента: доступ уже сохранён");
    }
  }
  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const student = await studentContext.newPage();
  await login(student, "student");
  await student.getByRole("textbox", { name: "Сообщение ментору" }).waitFor();
  await student.screenshot({ path: path.join(artifacts, "student-desktop.png") });
  await noOverflow(student, "Студент: нет горизонтального переполнения");
  await student.getByRole("link", { name: "Навыки и прогресс" }).click();
  await student.getByText("Стоит повторить:", { exact: false }).waitFor();
  check("Прогресс и weaknesses доступны", true);
  await student.getByRole("link", { name: "Профиль", exact: true }).click();
  await student.getByText("Рекорд серии", { exact: true }).waitFor();
  check("Профиль и серия доступны", true);
  await student.goto(`${base}/dashboard`);
  await student.getByRole("heading", { name: "Чат с ментором", exact: true }).waitFor();
  check("Студент не открывает дашборд", new URL(student.url()).pathname === "/chat");
  await student.setViewportSize({ width: 390, height: 844 });
  await noOverflow(student, "Мобильный чат: нет горизонтального переполнения");
  await student.screenshot({ path: path.join(artifacts, "student-mobile.png") });
  if (process.argv.includes("--exercise-chat")) {
  const questionMode = student.getByRole("radio", { name: "Вопрос ментору" });
  if (await questionMode.count()) await student.getByText("Вопрос ментору", { exact: true }).click();
  const message = `Кратко объясни, что такое модель машинного обучения. Проверка интерфейса ${Date.now()}.`;
  await student.getByRole("textbox", { name: "Сообщение ментору" }).fill(message);
  const request = student.waitForRequest((r) => r.url().endsWith("/api/chat") && r.method() === "POST");
  const response = student.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: 180000 });
  await student.getByRole("button", { name: "Отправить", exact: true }).click();
  check("Свободный чат не отправляет старый question_id", (await request).postDataJSON().question_id === null);
  check("Ответ свободного чата через UI", (await response).ok());
  await student.getByText(message, { exact: true }).waitFor();
  check("После отправки видны последние сообщения", await student.getByRole("log", { name: "История диалога" }).evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight < 3));
  }
  await student.getByRole("link", { name: "Профиль", exact: true }).click();
  await student.getByText("Рекорд серии", { exact: true }).waitFor();
  await noOverflow(student, "Мобильный профиль: нет переполнения");
  await student.screenshot({ path: path.join(artifacts, "profile-mobile.png") });
  await student.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await student.getByRole("heading", { name: "Вход в кабинет" }).waitFor();
  check("Выход возвращает на вход", true);

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await adminContext.newPage();
  await login(admin, "admin");
  await admin.getByText("Всего студентов", { exact: true }).waitFor();
  await noOverflow(admin, "Дашборд: нет переполнения");
  await admin.screenshot({ path: path.join(artifacts, "dashboard-desktop.png") });
  const period = admin.waitForResponse((r) => r.url().includes("/administration/stats?days=7")).catch(() => null);
  await admin.getByRole("combobox", { name: "Период активности" }).click();
  await admin.getByRole("option", { name: "7 дней", exact: true }).click();
  check("Дашборд меняет период", Boolean((await period)?.ok()));
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.reload();
  await admin.getByText("Всего студентов", { exact: true }).waitFor();
  await noOverflow(admin, "Мобильный дашборд: нет переполнения");
  await admin.screenshot({ path: path.join(artifacts, "dashboard-mobile.png") });
  await admin.evaluate(() => sessionStorage.setItem("ai-mentor-token", "invalid-token"));
  await admin.reload();
  await admin.getByRole("heading", { name: "Вход в кабинет", exact: true }).waitFor();
  check("401 очищает сеанс и возвращает на вход", await admin.evaluate(() => sessionStorage.getItem("ai-mentor-token") === null));
  check("Нет исключений браузера", report.errors.length === 0);
} catch (error) {
  report.failure = error.message;
  for (const [index, page] of browser.contexts().flatMap((context) => context.pages()).entries()) {
    await page.screenshot({ path: path.join(artifacts, `failure-${index}.png`) }).catch(() => undefined);
    const text = await page.locator("body").innerText().catch(() => "");
    report.pageText = text.slice(0, 2000);
  }
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
