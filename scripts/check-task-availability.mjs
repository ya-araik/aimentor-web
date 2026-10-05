import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Integration probe for the selected group's skill catalogue and task generation.
// Credentials stay in the ignored local file; reports contain no tokens/passwords.
const root = process.cwd();
const groupId = Number(process.argv[2] ?? 2);
if (!Number.isInteger(groupId) || groupId < 1) throw new Error("Provide a positive group ID");
const local = path.join(root, ".local");
const accountsPath = path.join(local, "integration-accounts.json");
const accounts = JSON.parse(await readFile(accountsPath, "utf8"));
const contract = JSON.parse(await readFile(path.join(root, "project-plan/contracts/aimmentor.openapi.json"), "utf8"));
const proxy = "http://localhost:8080/api";
const upstream = contract.servers[0].url.replace(/\/$/, "");
const key = `studentGroup${groupId}`;
const report = { checkedAt: new Date().toISOString(), groupId, results: [] };

async function call(base, endpoint, token, method = "GET", body) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + endpoint, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = raw; }
  return { status: response.status, payload };
}

const groups = await call(proxy, "/groups");
if (groups.status !== 200 || !groups.payload.some((group) => group.id === groupId)) throw new Error("Group unavailable");
report.registrationGroup = groups.payload.find((group) => group.id === groupId).name;
if (!accounts[key]) {
  const account = { username: `qa_group${groupId}_${Date.now().toString(36)}`, password: randomBytes(20).toString("base64url") };
  const registered = await call(proxy, "/register", null, "POST", { ...account, group_id: groupId, role: "student" });
  if (registered.status !== 201) throw new Error(`QA registration failed: ${registered.status}`);
  accounts[key] = account;
  await writeFile(accountsPath, JSON.stringify(accounts, null, 2));
}
const login = await call(proxy, "/login", null, "POST", accounts[key]);
if (login.status !== 200 || !login.payload.token) throw new Error(`Login failed: ${login.status}`);
const token = login.payload.token;
report.userId = login.payload.user.id;
report.profileGroup = login.payload.user.group;
for (const endpoint of ["/skills", "/progress"]) {
  const result = await call(proxy, endpoint, token);
  report.results.push({ route: "proxy", endpoint, status: result.status, count: Array.isArray(result.payload) ? result.payload.length : null });
}
const task = await call(proxy, "/task", token, "POST");
function taskResult(route, result) {
  return { route, endpoint: "POST /task", status: result.status,
    ...(result.status === 200 ? { questionId: result.payload.question_id } : { error: result.payload }) };
}
report.results.push(taskResult("proxy", task));
// A direct repeat distinguishes a server failure from the local reverse proxy.
if (task.status >= 500) report.results.push(taskResult("upstream", await call(upstream, "/task", token, "POST")));
await mkdir(path.join(local, "task-availability"), { recursive: true });
await writeFile(path.join(local, "task-availability", `group-${groupId}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (task.status !== 200) process.exitCode = 1;
