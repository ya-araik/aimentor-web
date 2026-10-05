import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Reads the customer API with existing QA accounts. Task creation in the UI is
// explicitly mocked and never forwarded to the server.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const accounts = JSON.parse(await readFile(".local/integration-accounts.json", "utf8"));
const artifacts = path.resolve(".local/ui-review");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { checkedAt: new Date().toISOString(), checks: [], errors: [] };
function check(name, passed) {
  report.checks.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) throw new Error(name);
}
async function login(kind) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto("http://localhost:8080/login");
  await page.getByLabel(/^Логин/).fill(accounts[kind].username);
  await page.getByLabel(/^Пароль/).fill(accounts[kind].password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("heading", { name: kind === "admin" ? "Дашборд" : "Чат с ментором", exact: true }).waitFor();
  return { page, context };
}
async function screenshot(page, name) {
  if (page.viewportSize().width < 768 && !name.startsWith("login")) {
    await page.getByRole("navigation", { name: "Основная навигация" }).waitFor();
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  }
  await page.screenshot({ path: path.join(artifacts, name + ".png"), fullPage: page.viewportSize().width >= 768 });
  check(`${name}: без горизонтального переполнения`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
try {
  const active = await login("registered");
  await active.page.getByText("Ответ на задание", { exact: true }).waitFor();
  check("Выданное задание открывает режим ответа", await active.page.getByRole("radio", { name: "Ответ на задание" }).isChecked());
  const composer = active.page.getByRole("textbox", { name: "Сообщение ментору" });
  const bounds = await composer.boundingBox();
  check("Поле ответа видно на первом экране десктопа", bounds && bounds.y + bounds.height <= 1000);
  await composer.fill("Черновик ответа");
  await active.page.getByText("Вопрос ментору", { exact: true }).click();
  check("Выбор свободного вопроса сохраняет черновик", await composer.inputValue() === "Черновик ответа");
  await active.page.getByText("Ответ на задание", { exact: true }).click();
  await composer.fill("");
  await screenshot(active.page, "active-task-desktop");
  await active.page.setViewportSize({ width: 390, height: 844 });
  await composer.fill("Черновик на телефоне");
  await screenshot(active.page, "active-task-mobile");
  check("Задание не занимает место в мобильном чате", !(await active.page.getByText("Текущее задание", { exact: true }).isVisible()));
  await active.page.getByRole("button", { name: "Открыть задание" }).click();
  await active.page.getByRole("heading", { name: "Практическое задание" }).waitFor();
  check("Задание открыто отдельным экраном", !(await composer.isVisible()) && await active.page.getByRole("button", { name: "Ответить в чате" }).isVisible());
  await screenshot(active.page, "task-screen-mobile");
  await active.page.getByRole("button", { name: "Ответить в чате" }).click();
  check("Возврат в чат сохраняет черновик", await composer.inputValue() === "Черновик на телефоне");
  await active.page.getByRole("button", { name: "Открыть задание" }).click();
  await active.page.goBack();
  await active.page.getByRole("heading", { name: "Чат с ментором", exact: true }).waitFor();
  check("Назад браузера возвращает из задания в чат", await composer.isVisible());
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 767, height: 844 }, { width: 390, height: 430 }]) {
    await active.page.setViewportSize(viewport);
    await active.page.waitForFunction(() => document.documentElement.style.getPropertyValue("--app-height") === `${window.visualViewport?.height ?? innerHeight}px`);
    const geometry = await active.page.evaluate(() => {
      const input = document.querySelector('textarea[aria-label="Сообщение ментору"]').getBoundingClientRect();
      const nav = document.querySelector('.mobile-nav').getBoundingClientRect();
      const log = document.querySelector('[role="log"]').getBoundingClientRect();
      return { noPageScroll: document.documentElement.scrollHeight <= innerHeight + 1, inputVisible: input.bottom <= nav.top && input.top >= 0, historyHeight: log.height, noOverflow: document.documentElement.scrollWidth <= innerWidth, pageHeight: document.documentElement.scrollHeight, inputBottom: input.bottom, navigationTop: nav.top };
    });
    (report.geometry ??= []).push({ viewport, ...geometry });
    if (!geometry.noPageScroll || !geometry.inputVisible || geometry.historyHeight <= 100 || !geometry.noOverflow) {
      await active.page.screenshot({ path: path.join(artifacts, `geometry-failure-${viewport.width}-${viewport.height}.png`) });
      console.log(JSON.stringify(geometry));
    }
    check(`Чат ${viewport.width}×${viewport.height}: поле видно, прокрутка внутри истории`, geometry.noPageScroll && geometry.inputVisible && geometry.historyHeight > 100 && geometry.noOverflow);
  }
  await active.page.setViewportSize({ width: 390, height: 844 });
  await composer.focus();
  await active.page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 440 });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await active.page.waitForFunction(() => document.querySelector('.account-shell').classList.contains('keyboard-open'));
  const keyboardGeometry = await composer.boundingBox();
  check("Уменьшение visualViewport оставляет поле над клавиатурой", keyboardGeometry.y + keyboardGeometry.height <= 440 && !(await active.page.getByRole("navigation", { name: "Основная навигация" }).isVisible()));
  await active.page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await active.page.getByRole("navigation", { name: "Основная навигация" }).waitFor();
  await active.page.getByText("Вопрос ментору", { exact: true }).click();
  await active.page.getByRole("link", { name: "Навыки", exact: true }).click();
  await active.page.getByRole("heading", { name: "Навыки и прогресс", exact: true }).waitFor();
  await active.page.getByRole("link", { name: "Чат", exact: true }).click();
  await active.page.getByRole("heading", { name: "Чат с ментором", exact: true }).waitFor();
  check("Нижняя навигация сохраняет черновик при возврате", await composer.inputValue() === "Черновик на телефоне");
  check("Нижняя навигация сохраняет режим свободного вопроса", await active.page.getByRole("radio", { name: "Вопрос ментору" }).isChecked());
  await composer.fill("");
  await active.context.close();

  const fresh = await login("studentGroup2");
  await fresh.page.getByRole("button", { name: "Получить задание", exact: true }).waitFor();
  await fresh.page.getByText("Диалог пока пуст", { exact: true }).waitFor();
  let mutations = 0;
  fresh.page.on("request", (request) => { if (request.method() === "POST" && /\/api\/(chat|task)$/.test(request.url())) mutations++; });
  const prompt = "Объясни разницу между ИИ и машинным обучением";
  await fresh.page.getByRole("button", { name: prompt }).click();
  check("Пример вопроса заполняет поле", await fresh.page.getByRole("textbox", { name: "Сообщение ментору" }).inputValue() === prompt);
  check("Пример не отправляет запрос автоматически", mutations === 0);
  await fresh.page.getByRole("textbox", { name: "Сообщение ментору" }).fill("");
  await screenshot(fresh.page, "first-practice-desktop");
  await fresh.page.setViewportSize({ width: 390, height: 844 });
  await screenshot(fresh.page, "first-practice-mobile");
  await fresh.page.getByRole("button", { name: "Начать практику" }).click();
  await fresh.page.getByRole("heading", { name: "Практическое задание", exact: true }).waitFor();
  check("Получение задания доступно на отдельном экране", await fresh.page.getByRole("button", { name: "Получить задание", exact: true }).isVisible());
  await screenshot(fresh.page, "get-task-screen-mobile");
  await fresh.page.route("**/api/task", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ question_id: "ui-only-task", question: "Проверочное задание интерфейса: объясните различия подходов к обучению модели." }) }));
  await fresh.page.getByRole("button", { name: "Получить задание", exact: true }).click();
  await fresh.page.getByText("Проверочное задание интерфейса: объясните различия подходов к обучению модели.", { exact: true }).waitFor();
  check("Выдача в UI (mock) показывает текст до перехода в чат", await fresh.page.getByRole("button", { name: "Ответить в чате" }).isVisible());
  await fresh.page.getByRole("button", { name: "Ответить в чате" }).click();
  check("После выдачи в UI (mock) включён ответ на задание", await fresh.page.getByRole("radio", { name: "Ответ на задание" }).isChecked());
  await fresh.page.getByRole("button", { name: "Открыть задание" }).click();
  await fresh.page.getByRole("button", { name: "Вернуться в чат", exact: true }).click();
  await fresh.page.getByRole("link", { name: "Навыки", exact: true }).click();
  await fresh.page.getByText("Для вашей группы пока нет доступных навыков", { exact: true }).waitFor();
  check("Новому студенту сначала показан каталог", await fresh.page.getByRole("tab", { name: "Каталог навыков" }).getAttribute("aria-selected") === "true");
  await screenshot(fresh.page, "empty-catalog-mobile");
  await fresh.page.getByRole("tab", { name: "Мой прогресс" }).click();
  await fresh.page.getByText("Пока нет оценённых навыков", { exact: true }).waitFor();
  check("Пустой прогресс предлагает перейти к практике", await fresh.page.getByRole("link", { name: "Перейти к практике" }).isVisible());
  await fresh.context.close();

  const admin = await login("admin");
  await admin.page.getByText("Всего студентов", { exact: true }).waitFor();
  await screenshot(admin.page, "dashboard-desktop");
  await admin.page.setViewportSize({ width: 390, height: 844 });
  await screenshot(admin.page, "dashboard-mobile");
  await admin.context.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto("http://localhost:8080/login");
  await screenshot(page, "login-desktop");
  await context.close();
  check("Нет исключений JavaScript", report.errors.length === 0);
} finally {
  await writeFile(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
