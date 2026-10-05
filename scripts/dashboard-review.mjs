import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Existing QA admin, read-only customer API. Empty/error responses below are
// browser-local fixtures and never change server data.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const accounts = JSON.parse(await readFile(".local/integration-accounts.json", "utf8"));
const base = process.env.WEB_URL || "http://localhost:8080";
const artifacts = path.resolve(".local/dashboard-review");
await mkdir(artifacts, { recursive: true });
const report = { checkedAt: new Date().toISOString(), checks: [], errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
function check(name, passed) {
  report.checks.push({ name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) throw new Error(name);
}
async function noOverflow(name) {
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  check(name, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
async function graphs(name, count) {
  await page.waitForFunction((expected) => [...document.querySelectorAll(".analytics-chart")].filter((el) => el.getBoundingClientRect().width > 0 && el.querySelector("svg")).length === expected, count);
  check(name, await page.locator(".analytics-chart").filter({ has: page.locator("svg") }).count() === count);
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel(/^Логин/).fill(accounts.admin.username);
  await page.getByLabel(/^Пароль/).fill(accounts.admin.password);
  const loaded = page.waitForResponse((response) => response.url().includes("/administration/stats?days=30") && response.status() === 200);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const data = await (await loaded).json();
  await page.getByRole("heading", { name: "Дашборд", exact: true }).waitFor();
  await graphs("Обзор: шесть диаграмм с реальными данными", 6);
  await noOverflow("Десктоп: страница без горизонтального переполнения");
  check("Карта содержит строки всех групп", await page.locator(".heat-row").count() === new Set([...data.activity_by_group, ...data.completed_tasks_by_group, ...data.daily_activity].map((row) => row.group_id)).size);
  check("Показан фактический диапазон дат", await page.getByText(/Даты в ответе:/).isVisible());
  const cell = page.locator(".heat-cell").first();
  await cell.click();
  check("Нажатие на ячейку раскрывает числа", await page.locator(".heat-selection").isVisible());
  await page.screenshot({ path: path.join(artifacts, "overview-desktop.png"), fullPage: true });
  const groups = [...new Map([...data.activity_by_group, ...data.daily_activity].map((row) => [row.group_id, row.group_name])).values()];
  if (groups.length > 1) {
    await page.getByRole("combobox", { name: "Группа в графиках активности" }).click();
    await page.getByRole("option", { name: groups[1], exact: true }).click();
    check("Фильтр группы меняет строки тепловой карты", await page.locator(".heat-row").count() === 1);
    check("Пропуск записи обозначен явно", await page.locator('.heat-cell[aria-label$="нет записи"]').count() > 0);
    await page.getByRole("combobox", { name: "Группа в графиках активности" }).click();
    await page.getByRole("option", { name: "Все группы", exact: true }).click();
  }
  await page.getByRole("combobox", { name: "Период активности" }).click();
  const period = page.waitForResponse((response) => response.url().includes("/administration/stats?days=7") && response.status() === 200);
  await page.getByRole("option", { name: "7 дней", exact: true }).click();
  await period;
  await page.getByRole("heading", { name: "Тепловая карта активности" }).waitFor();
  check("Период отправлен серверу как days=7", true);
  await page.getByRole("tab", { name: "Навыки", exact: true }).click();
  await graphs("Навыки: гистограмма, точки и рейтинг", 3);
  check("Карта содержит все навыки API", await page.locator(".skill-tile").count() === data.avg_progress_by_skill.length);
  await page.getByLabel("Поиск навыка").fill(data.avg_progress_by_skill[0].skill);
  check("Поиск фильтрует карту и рейтинг", await page.locator(".skill-tile").count() === 1);
  await page.locator(".skill-tile").first().click();
  check("Подробности навыка доступны нажатием", await page.locator(".heat-selection").isVisible());
  await page.getByLabel("Поиск навыка").fill("нет-такого-навыка");
  check("У поиска есть пустое состояние", await page.getByText("По этому запросу навыков нет.").isVisible());
  await page.getByLabel("Поиск навыка").fill("");
  await page.getByText("Сильные", { exact: true }).click();
  const maxSkill = [...data.avg_progress_by_skill].sort((a, b) => b.avg_level - a.avg_level)[0];
  check("Сортировка начинает с сильнейшего навыка", (await page.locator(".skill-tile").first().textContent()).includes(maxSkill.skill));
  await page.getByRole("figure", { name: "Рейтинг среднего освоения по навыкам" }).locator(".recharts-bar-rectangle").first().hover();
  await page.locator(".analytics-tooltip").filter({ hasText: maxSkill.skill }).waitFor();
  check("Подсказка рейтинга показывает полное название и оценку", true);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, "skills-desktop.png"), fullPage: true });
  for (const width of [390, 320, 767]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(`Навыки ${width}px: без горизонтального переполнения`);
    await graphs(`Навыки ${width}px: диаграммы видимы`, 3);
    check(`Навигация ${width}px доступна`, await page.getByRole("navigation", { name: "Основная навигация" }).isVisible());
    if (width === 390) await page.screenshot({ path: path.join(artifacts, "skills-mobile.png") });
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await noOverflow(`Обзор ${width}px: без горизонтального переполнения`);
    await graphs(`Обзор ${width}px: диаграммы видимы`, 6);
    check(`Карта ${width}px: прокрутка внутри блока`, await page.locator(".activity-heat-scroll").evaluate((el) => el.scrollWidth > el.clientWidth && el.clientWidth <= innerWidth));
    if (width === 390) await page.screenshot({ path: path.join(artifacts, "overview-mobile.png") });
    await page.getByRole("tab", { name: "Навыки", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Данные", exact: true }).click();
  await page.getByRole("button", { name: /^Группы ·/ }).click();
  await page.getByRole("columnheader", { name: "Активные студенты", exact: true }).waitFor();
  check("Точные исходные числа доступны таблицей", await page.getByRole("columnheader", { name: "Активные студенты", exact: true }).isVisible());
  await noOverflow("Таблицы на телефоне прокручиваются внутри блока");
  const empty = { total_students: 0, active_groups_count: 0, avg_progress_by_skill: [], weakest_skills: [], activity_by_group: [], completed_tasks_by_group: [], daily_activity: [] };
  await page.route("**/api/administration/stats?*", (route) => route.fulfill({ json: empty }));
  await page.reload();
  await page.getByText("За выбранный период нет записей", { exact: true }).waitFor();
  check("Пустой ответ без выдуманных диаграмм", await page.locator(".analytics-chart").count() === 0);
  await page.getByRole("tab", { name: "Навыки", exact: true }).click();
  check("Пустые навыки имеют понятное состояние", await page.getByText("Пока нет оценённых навыков.", { exact: true }).isVisible());
  await page.unroute("**/api/administration/stats?*");
  await page.route("**/api/administration/stats?*", (route) => route.fulfill({ status: 500, json: { error: "Dashboard test error" } }));
  await page.reload();
  await page.getByText("Dashboard test error", { exact: false }).waitFor();
  check("Ошибка сервера предлагает повторить запрос", await page.getByRole("button", { name: "Повторить", exact: true }).isVisible());
  check("Нет ошибок JavaScript", report.errors.length === 0);
} catch (error) {
  report.failure = error.message;
  await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true });
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
