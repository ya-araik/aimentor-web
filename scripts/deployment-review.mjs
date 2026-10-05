import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Builds from a clean source copy, without local .env, QA credentials or npm
// installation. Only GET /groups is sent to the customer's existing API.
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(root,".local/deployment-review");
const run = Date.now().toString(36);
const clean = path.join(artifacts,`source-${run}`);
const project = `aimentor-deploy-check-${run}`;
const port = Number(process.env.DEPLOY_REVIEW_PORT || 18082);
const report = { at:new Date().toISOString(),checks:[],cleanSource:clean };
const environment = { ...process.env };
for (const name of ["API_UPSTREAM","WEB_PORT","COMPOSE_FILE","COMPOSE_PROJECT_NAME","COMPOSE_PROFILES"]) delete environment[name];
const docker = (args,options={}) => exec("docker",args,{cwd:clean,env:environment,maxBuffer:8*1024*1024,...options});
const compose = (args,options) => docker(["compose","-p",project,...args],options);
let started = false;
function check(name,value) {
  report.checks.push({name,passed:Boolean(value)});
  console.log(`${value ? "PASS" : "FAIL"} ${name}`);
  if (!value) throw new Error(name);
}
async function get(route,activePort=port) {
  return fetch(`http://localhost:${activePort}${route}`,{signal:AbortSignal.timeout(15000)});
}
try {
  await mkdir(clean,{recursive:true});
  const { stdout } = await exec("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root,maxBuffer:8*1024*1024});
  const files = [...new Set(stdout.split("\0").filter(Boolean))];
  const forbidden = /(^|\/)(\.git|\.local|node_modules|dist|coverage)(\/|$)|(^|\/)\.env($|\.(?!example$))/;
  check("Исходники для передачи не содержат локальных env, доступов и артефактов", files.length > 0 && !files.some((name) => forbidden.test(name)));
  for (const file of files) {
    const target = path.resolve(clean,file);
    if (!target.startsWith(`${clean}${path.sep}`)) throw new Error("Source path leaves the clean workspace");
    await mkdir(path.dirname(target),{recursive:true});
    await copyFile(path.join(root,file),target);
  }
  // Ensure real local passwords aren't accidentally present in tracked docs.
  const privateAccounts = await readFile(path.join(root,".local/integration-accounts.json"),"utf8").then(JSON.parse).catch(() => null);
  const privatePasswords = privateAccounts ? Object.values(privateAccounts).map((item) => item?.password).filter((value) => typeof value === "string" && value.length >= 8) : [];
  const leakedFiles = [];
  for (const file of files) {
    const contents = await readFile(path.join(clean,file),"utf8");
    if (privatePasswords.some((password) => contents.includes(password))) leakedFiles.push(file);
  }
  check("Пароли реальных QA-аккаунтов не попадают в передаваемые файлы", leakedFiles.length === 0);
  const missing = await compose(["config","--quiet"]).then(() => null,(error) => error);
  check("Без корневого .env есть понятная ошибка API_UPSTREAM", Boolean(missing?.stderr?.includes("Create .env from .env.example")));
  const example = await readFile(path.join(clean,".env.example"),"utf8");
  const upstream = example.match(/^API_UPSTREAM=(.+)$/m)?.[1].trim();
  if (!upstream) throw new Error("API_UPSTREAM missing in example");
  const makeEnv = (url,externalPort) => example.replace(/^API_UPSTREAM=.*$/m,`API_UPSTREAM=${url}`).replace(/^WEB_PORT=.*$/m,`WEB_PORT=${externalPort}`);
  await writeFile(path.join(clean,".env"),makeEnv(upstream,port));
  const { stdout:configText } = await compose(["config","--format","json"]);
  const service = JSON.parse(configText).services.web;
  check("Единственный .env задаёт URL и опубликованный порт", service.environment.API_UPSTREAM === upstream && String(service.ports[0].published) === String(port));
  check("Настроены автоперезапуск, healthcheck и ограничение логов", service.restart === "unless-stopped" && !!service.healthcheck && service.logging.options["max-size"] === "10m");
  console.log("BUILD clean repository via Docker…");
  started = true;
  const build = await compose(["up","-d","--build","--wait","--wait-timeout","90"],{timeout:240000});
  await writeFile(path.join(artifacts,"build.log"),build.stdout+build.stderr);
  check("Чистая копия собирается и запускается одним Docker Compose", true);
  const { stdout:idText } = await compose(["ps","-q","web"]);
  const id = idText.trim();
  const { stdout:health } = await docker(["inspect","--format","{{.State.Health.Status}}",id]);
  check("Контейнер healthy", health.trim() === "healthy");
  check("Health endpoint возвращает ok", (await (await get("/healthz")).text()).trim() === "ok");
  const index = await get("/login");
  const html = await index.text();
  check("SPA доступна по прямому маршруту /login без кеширования HTML", index.status === 200 && html.includes('<div id="root">') && index.headers.get("cache-control")?.includes("no-cache"));
  for (const route of ["/chat","/dashboard","/profile"]) {
    const response = await get(route);
    check(`Прямой маршрут ${route} возвращает SPA`, response.status === 200 && (await response.text()).includes('<div id="root">'));
  }
  const assetPath = html.match(/src="([^\"]+\/assets\/[^\"]+\.js)"/)?.[1] ?? html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  if (!assetPath) throw new Error("Built JavaScript asset missing");
  const asset = await get(assetPath);
  check("JS отдаётся с кешированием и защитными заголовками", asset.status === 200 && asset.headers.get("cache-control")?.includes("31536000") && asset.headers.get("x-content-type-options") === "nosniff" && asset.headers.has("content-security-policy"));
  check("Несуществующий asset не подменяется HTML", (await get("/assets/not-a-real-chunk.js")).status === 404);
  const groups = await get("/api/groups");
  check("Прокси /api/groups обращается к существующему API", groups.status === 200 && Array.isArray(await groups.json()));
  const { stdout:runtimeFiles } = await compose(["exec","-T","web","find","/usr/share/nginx/html","-type","f"]);
  check("В runtime-образе нет исходных env, node_modules и QA-доступов", !runtimeFiles.includes(".env") && !runtimeFiles.includes("node_modules") && !runtimeFiles.includes("integration-accounts"));
  const { stdout:beforeImage } = await docker(["inspect","--format","{{.Image}}",id]);
  await writeFile(path.join(clean,".env"),makeEnv(`${upstream}/`,port+1));
  await compose(["up","-d","--no-build","--wait","--wait-timeout","90"]);
  const { stdout:newId } = await compose(["ps","-q","web"]);
  const { stdout:afterImage } = await docker(["inspect","--format","{{.Image}}",newId.trim()]);
  check("Изменение .env применяется без пересборки образа", beforeImage.trim() === afterImage.trim() && (await get("/healthz",port+1)).status === 200);
  const trailing = await get("/api/groups",port+1);
  check("Завершающий слеш URL не ломает прокси", trailing.status === 200 && Array.isArray(await trailing.json()));
  const invalid = await docker(["run","--rm","-e","API_UPSTREAM=ftp://invalid.example",beforeImage.trim()]).then(() => null,(error) => error);
  check("Неподдерживаемая схема API отклоняется с объяснением", Boolean(invalid?.stderr?.includes("full http:// or https:// API URL")));
} catch (error) {
  report.failure = error.message;
  if (error.stdout || error.stderr) await writeFile(path.join(artifacts,"failure.log"),`${error.stdout || ""}${error.stderr || ""}`);
  process.exitCode = 1;
} finally {
  if (started) await compose(["down"]).catch((error) => { report.cleanupError = error.message; process.exitCode = 1; });
  await writeFile(path.join(artifacts,"report.json"),JSON.stringify(report,null,2));
  console.log(`${report.checks.filter((item) => item.passed).length}/${report.checks.length} checks passed`);
  if (report.failure) console.error(report.failure);
}
