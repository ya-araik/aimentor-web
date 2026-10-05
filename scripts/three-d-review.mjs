import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Read-only real API with the existing QA admin; error/empty cases are local
// browser fixtures. SwiftShader allows WebGL checks without a physical GPU.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "playwright");
const accounts = JSON.parse(await readFile(".local/integration-accounts.json", "utf8"));
const base = process.env.WEB_URL || "http://localhost:8080";
const artifacts = path.resolve(".local/three-d-review");
await mkdir(artifacts, { recursive: true });
const report = { checkedAt: new Date().toISOString(), checks: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
const loadedChunks = [];
page.on("request", (request) => { if (request.url().includes("plotly-gl3d")) loadedChunks.push(request.url()); });
function check(name, value) {
  report.checks.push({ name, passed: Boolean(value) });
  console.log(`${value ? "PASS" : "FAIL"} ${name}`);
  if (!value) throw new Error(name);
}
const calendar = page.locator('[data-surface="calendar"]');
const distribution = page.locator('[data-surface="distribution"]');
const ready = (target) => target.locator('.surface-canvas').waitFor().then(() => target.page().waitForFunction((id) => document.querySelector(`[data-surface="${id}"]`)?.getAttribute("data-ready") === "true", target === calendar ? "calendar" : "distribution", { timeout: 60000 }));
const readCamera = (target) => target.locator(".surface-canvas").evaluate((el) => el.layout.scene.camera);
const distance = (camera) => Math.hypot(camera.eye.x, camera.eye.y, camera.eye.z);
try {
  await page.goto(`${base}/login`);
  await page.getByLabel(/^Логин/).fill(accounts.admin.username);
  await page.getByLabel(/^Пароль/).fill(accounts.admin.password);
  const response = page.waitForResponse((res) => res.url().includes("/administration/stats?days=30") && res.status() === 200);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const data = await (await response).json();
  await page.getByRole("heading", { name: "Дашборд", exact: true }).waitFor();
  check("Plotly не загружается до открытия 3D", loadedChunks.length === 0);
  await page.getByRole("tab", { name: "3D", exact: true }).click();
  await ready(calendar); await ready(distribution);
  check("Две WebGL-сцены построены; библиотека загружена один раз", loadedChunks.length === 1);
  const traces = await calendar.locator(".surface-canvas").evaluate((el) => el.data.map((item) => ({ type: item.type, z: item.z, connectgaps: item.connectgaps })));
  check("Календарь сохраняет сумму сообщений реального API", traces.find((trace) => trace.type === "scatter3d").z.reduce((sum,value) => sum+value,0) === data.daily_activity.reduce((sum,row) => sum+row.messages_count,0));
  check("Пропуски остались null, поверхность их не соединяет", traces[0].type === "surface" && traces[0].connectgaps === false && traces[0].z.flat().some((value) => value === null));
  const histogram = await distribution.locator(".surface-canvas").evaluate((el) => el.data.find((item) => item.type === "scatter3d").z);
  check("Гистограмма учитывает каждый навык ровно один раз", histogram.reduce((sum,value) => sum+value,0) === data.avg_progress_by_skill.length);
  check("Необычные даты API отмечены", await page.getByText("Проверка дат", { exact: true }).isVisible());
  await calendar.getByRole("button", { name: "Сверху", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-surface="calendar"] .surface-canvas').layout.scene.camera.eye.x === 0);
  check("Вид сверху меняет камеру", (await readCamera(calendar)).eye.z === 2.8);
  const beforeZoom = distance(await readCamera(calendar));
  await calendar.getByRole("button", { name: /^Приблизить:/ }).click();
  await page.waitForTimeout(250);
  check("Кнопка масштаба приближает сцену", distance(await readCamera(calendar)) < beforeZoom);
  await calendar.getByRole("button", { name: "Сбросить вид", exact: true }).click();
  await page.waitForTimeout(250);
  const startCamera = JSON.stringify(await readCamera(calendar));
  await calendar.locator(".surface-view").scrollIntoViewIfNeeded();
  const box = await calendar.locator(".surface-view").boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down(); await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+25,{ steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(250);
  check("Перетаскивание мышью вращает поверхность", JSON.stringify(await readCamera(calendar)) !== startCamera);
  await calendar.locator(".mantine-SegmentedControl-label").filter({ hasText: "Перемещение" }).click();
  check("Можно переключиться на перемещение", await calendar.locator(".surface-canvas").evaluate((el) => el.layout.scene.dragmode === "pan"));
  await calendar.getByRole("button", { name: "На весь экран", exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement?.getAttribute("data-surface") === "calendar");
  check("Полный экран открывает отдельную сцену", true);
  await page.waitForTimeout(300);
  await calendar.getByRole("combobox", { name: /^Точная точка:/ }).click();
  await page.getByRole("option").first().click();
  check("Точная точка выбирается и в нативном полном экране", (await calendar.locator(".surface-selection").textContent()).includes(data.daily_activity.map((row) => row.day).sort()[0].slice(8,10)));
  await page.screenshot({ path: path.join(artifacts,"calendar-fullscreen.png") });
  await calendar.getByRole("button", { name: "Закрыть полный экран", exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement === null);
  check("Выход из полного экрана возвращает страницу", await page.getByRole("heading", { name: "Дашборд", exact: true }).isVisible());
  const selector = distribution.getByRole("combobox", { name: /^Точная точка:/ });
  await selector.click(); await page.getByRole("option").first().click();
  check("Точный диапазон доступен через список", await distribution.locator(".surface-selection").textContent().then((text) => text.includes("Освоение 0–5%")));
  await page.screenshot({ path: path.join(artifacts,"surfaces-desktop.png"), fullPage: true });
  const groups = [...new Map(data.daily_activity.map((item) => [item.group_id,item.group_name])).entries()];
  const sparseGroup = groups.find(([id]) => data.daily_activity.filter((item) => item.group_id === id).length === 1);
  if (sparseGroup) {
    await page.getByRole("combobox", { name: "Группа в календарном рельефе" }).click();
    await page.getByRole("option", { name: sparseGroup[1], exact: true }).click();
    await ready(calendar);
    check("Разреженная группа показана точкой без выдуманного рельефа", await calendar.locator(".surface-canvas").evaluate((el) => el.data.length === 1 && el.data[0].type === "scatter3d" && el.data[0].z.length === 1));
    await page.getByRole("combobox", { name: "Группа в календарном рельефе" }).click();
    await page.getByRole("option", { name: "Все группы", exact: true }).click(); await ready(calendar);
  }
  await page.getByRole("combobox", { name: "Период активности" }).click();
  const period = page.waitForResponse((res) => res.url().includes("/administration/stats?days=7") && res.status() === 200);
  await page.getByRole("option", { name: "7 дней", exact: true }).click();
  await period; await ready(calendar);
  check("При смене периода вкладка 3D сохраняется", await page.getByRole("tab", { name: "3D", exact: true }).getAttribute("aria-selected") === "true");
  for (const width of [320,390,767]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(250);
    check(`3D ${width}px без горизонтального переполнения`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`3D ${width}px: жесты изначально выключены`, await calendar.getAttribute("data-gestures") === "false");
  }
  await page.screenshot({ path: path.join(artifacts,"surfaces-mobile.png"),fullPage:true });
  await calendar.getByRole("button", { name: "Включить жесты", exact: true }).click();
  await calendar.locator(".mantine-SegmentedControl-label").filter({ hasText: "Вращение" }).click();
  check("Управление жестами включается явно", await calendar.getAttribute("data-gestures") === "true");
  await calendar.locator(".surface-view").scrollIntoViewIfNeeded();
  const touchBox = await calendar.locator(".surface-view").boundingBox();
  const session = await context.newCDPSession(page);
  const tx = touchBox.x+touchBox.width/2, ty = Math.max(100,touchBox.y)+120;
  const beforeTouch = JSON.stringify(await readCamera(calendar));
  const touch = async (type, points) => session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x,y,id]) => ({x,y,id})) });
  await touch("touchStart",[[tx,ty,0]]); await touch("touchMove",[[tx+50,ty+20,0]]); await touch("touchEnd",[]); await page.waitForTimeout(250);
  check("Касание одним пальцем вращает камеру", JSON.stringify(await readCamera(calendar)) !== beforeTouch);
  const beforePinch = distance(await readCamera(calendar));
  await touch("touchStart",[[tx-35,ty,0],[tx+35,ty,1]]); await touch("touchMove",[[tx-65,ty,0],[tx+65,ty,1]]); await touch("touchEnd",[]); await page.waitForTimeout(250);
  check("Разведение двух пальцев приближает сцену", distance(await readCamera(calendar)) < beforePinch);
  await calendar.getByRole("button", { name: "Завершить управление", exact: true }).click();
  check("Отключение жестов возвращает обычную прокрутку", await calendar.getAttribute("data-gestures") === "false");
  // CSS fullscreen fallback used by browsers without the native API.
  await page.evaluate(() => { Element.prototype.requestFullscreen = undefined; });
  await calendar.getByRole("button", { name: "На весь экран", exact: true }).click();
  check("Без Fullscreen API работает полноэкранная панель", await page.getByRole("dialog", { name: "Рельеф учебной активности" }).isVisible());
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".surface-fullscreen-fallback"));
  check("Escape закрывает полноэкранную панель", true);
  await page.getByRole("tab", { name: "Обзор", exact: true }).click();
  check("После ухода со вкладки 3D сцены удаляются", await page.locator(".surface-canvas").count() === 0);
  // No WebGL support: error explanation and exact data remain accessible.
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type,...args) { return type === "webgl" || type === "webgl2" ? null : original.call(this,type,...args); };
  });
  await page.reload(); await page.getByRole("tab", { name: "3D", exact: true }).click();
  await page.getByText("3D-график недоступен", { exact: true }).first().waitFor();
  check("Без WebGL есть объяснение и точные значения", await calendar.locator(".surface-selection").isVisible());
  await page.getByRole("tab", { name: "Данные", exact: true }).click();
  check("Без WebGL остальные вкладки продолжают работать", await page.locator(".surface-canvas").count() === 0);
  await page.route("**/api/administration/stats?**", (route) => route.fulfill({ contentType:"application/json", body: JSON.stringify({ total_students:0,active_groups_count:0,avg_progress_by_skill:[],weakest_skills:[],activity_by_group:[],completed_tasks_by_group:[],daily_activity:[] }) }));
  await page.reload(); await page.getByRole("tab", { name: "3D", exact: true }).click();
  await page.getByRole("heading", { name: "Рельеф распределения навыков", exact: true }).waitFor();
  check("Пустой ответ не создаёт выдуманные 3D-сцены", await page.locator(".surface-canvas").count() === 0);
  check("Нет необработанных ошибок браузера", report.errors.length === 0);
} catch (error) {
  report.failure = error.message;
  await page.screenshot({ path:path.join(artifacts,"failure.png"),fullPage:true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(path.join(artifacts,"report.json"),JSON.stringify(report,null,2));
  await browser.close();
  console.log(`${report.checks.filter((item) => item.passed).length}/${report.checks.length} checks passed`);
  if (report.failure) console.error(report.failure);
}
