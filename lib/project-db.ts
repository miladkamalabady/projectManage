import { env } from "cloudflare:workers";
import seedTasks from "@/app/data/tasks.json";

export const roles = ["مدیر پروژه", "پیمانکار", "بهره‌بردار", "ناظر", "مشاهده‌گر"] as const;
export type ProjectRole = (typeof roles)[number];
type AuthIdentity = { userId: string; email: string; displayName: string };

export function getProjectDb() {
  if (!env.DB) throw new Error("پایگاه داده سامانه در دسترس نیست.");
  return env.DB;
}

export function identityFromRequest(request: Request): AuthIdentity | null {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  const proxyEmail = request.headers.get("x-authenticated-user-email");
  const email = request.headers.get("oai-authenticated-user-email") ?? accessEmail ?? proxyEmail;
  const userId = request.headers.get("oai-authenticated-user-id") ?? accessEmail ?? proxyEmail;
  if (!userId || !email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let displayName = email.split("@")[0];
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { displayName = email; }
  }
  return { userId, email, displayName };
}

export async function ensureUser(identity: AuthIdentity) {
  const db = getProjectDb();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const initialRole: ProjectRole = Number(count?.count ?? 0) === 0 ? "مدیر پروژه" : "مشاهده‌گر";
  await db.prepare("INSERT OR IGNORE INTO users (user_id, email, display_name, role) VALUES (?, ?, ?, ?)")
    .bind(identity.userId, identity.email, identity.displayName, initialRole).run();
  await db.prepare("UPDATE users SET email = ?, display_name = ?, last_seen_at = CURRENT_TIMESTAMP WHERE user_id = ?")
    .bind(identity.email, identity.displayName, identity.userId).run();
  return db.prepare("SELECT user_id AS userId, email, display_name AS displayName, role FROM users WHERE user_id = ?")
    .bind(identity.userId).first<{ userId: string; email: string; displayName: string; role: ProjectRole }>();
}

export async function ensureTasksSeeded() {
  const db = getProjectDb();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM tasks").first<{ count: number }>();
  if (Number(count?.count ?? 0) >= seedTasks.length) return;
  for (let offset = 0; offset < seedTasks.length; offset += 40) {
    const statements = seedTasks.slice(offset, offset + 40).map((task) =>
      db.prepare(`INSERT OR IGNORE INTO tasks
        (task_id, wbs, domain, title, acceptance_criteria, source_page, priority, owner_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(task.id, task.wbs, task.domain, task.title, task.acceptanceCriteria, task.sourcePage, task.priority, task.ownerType)
    );
    await db.batch(statements);
  }
}

export async function logActivity(entityType: string, entityId: string, action: string, payload: unknown, userId: string) {
  const db = getProjectDb();
  await db.prepare("INSERT INTO activity_log (entity_type, entity_id, action, payload, user_id) VALUES (?, ?, ?, ?, ?)")
    .bind(entityType, entityId, action, JSON.stringify(payload), userId).run();
}
