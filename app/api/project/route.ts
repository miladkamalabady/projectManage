import { ensureTasksSeeded, ensureUser, getProjectDb, identityFromRequest, logActivity, roles, type ProjectRole } from "@/lib/project-db";

export const dynamic = "force-dynamic";

const taskFieldsByRole: Record<ProjectRole, string[]> = {
  "مدیر پروژه": ["status","progress","plannedStart","deadline","actualEnd","deliverable","supervisorApproval","supervisorNote","operatorApproval","operatorNote","nextAction","nextOwner","nextDeadline","ownerType","priority"],
  "پیمانکار": ["status","progress","plannedStart","deadline","actualEnd","deliverable","nextAction","nextOwner","nextDeadline"],
  "بهره‌بردار": ["operatorApproval","operatorNote","nextAction","nextOwner","nextDeadline"],
  "ناظر": ["supervisorApproval","supervisorNote","nextAction","nextOwner","nextDeadline"],
  "مشاهده‌گر": [],
};
const taskColumns: Record<string, string> = {
  status: "status", progress: "progress", plannedStart: "planned_start", deadline: "deadline",
  actualEnd: "actual_end", deliverable: "deliverable", supervisorApproval: "supervisor_approval",
  supervisorNote: "supervisor_note", operatorApproval: "operator_approval", operatorNote: "operator_note",
  nextAction: "next_action", nextOwner: "next_owner", nextDeadline: "next_deadline",
  ownerType: "owner_type", priority: "priority",
};

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "خطای پیش‌بینی‌نشده" }, { status: 500 });
}
async function auth(request: Request) {
  const identity = identityFromRequest(request);
  if (!identity) return null;
  const user = await ensureUser(identity);
  return user ? { identity, user } : null;
}

export async function GET(request: Request) {
  try {
    const current = await auth(request);
    if (!current) return Response.json({ error: "ورود به سامانه الزامی است." }, { status: 401 });
    await ensureTasksSeeded();
    const db = getProjectDb();
    const [tasks, issues, meetings, users] = await Promise.all([
      db.prepare(`SELECT task_id AS taskId, wbs, domain, title, acceptance_criteria AS acceptanceCriteria,
        source_page AS sourcePage, priority, owner_type AS ownerType, status, progress,
        planned_start AS plannedStart, deadline, actual_end AS actualEnd, deliverable,
        supervisor_approval AS supervisorApproval, supervisor_note AS supervisorNote,
        operator_approval AS operatorApproval, operator_note AS operatorNote,
        next_action AS nextAction, next_owner AS nextOwner, next_deadline AS nextDeadline,
        updated_at AS updatedAt, updated_by AS updatedBy FROM tasks ORDER BY wbs, task_id`).all(),
      db.prepare(`SELECT id, issue_id AS issueId, task_id AS taskId, title, description, reporter, severity,
        priority, status, assignee, created_at AS createdAt, deadline, resolved_at AS resolvedAt,
        supervisor_approval AS supervisorApproval, operator_approval AS operatorApproval,
        retest_notes AS retestNotes, updated_at AS updatedAt FROM issues ORDER BY id DESC`).all(),
      db.prepare(`SELECT id, meeting_id AS meetingId, meeting_date AS meetingDate, type, subject, attendees,
        decision, action, owner, deadline, status, task_id AS taskId, document_url AS documentUrl,
        updated_at AS updatedAt FROM meetings ORDER BY COALESCE(meeting_date, updated_at) DESC`).all(),
      db.prepare("SELECT user_id AS userId, email, display_name AS displayName, role, last_seen_at AS lastSeenAt FROM users ORDER BY created_at").all(),
    ]);
    return Response.json({ tasks: tasks.results, issues: issues.results, meetings: meetings.results, users: users.results, currentUser: current.user, roles });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const current = await auth(request);
    if (!current) return Response.json({ error: "ورود به سامانه الزامی است." }, { status: 401 });
    const body = await request.json() as { entity?: string; id?: string | number; updates?: Record<string, unknown> };
    const updates = body.updates ?? {};
    const db = getProjectDb();

    if (body.entity === "task" && typeof body.id === "string") {
      const entries = Object.entries(updates).filter(([key]) => taskFieldsByRole[current.user.role].includes(key) && key in taskColumns);
      if (!entries.length) return Response.json({ error: "برای این تغییر دسترسی ندارید." }, { status: 403 });
      if (entries.some(([key]) => key === "progress")) {
        const progress = Number(updates.progress);
        if (!Number.isFinite(progress) || progress < 0 || progress > 100) return Response.json({ error: "درصد پیشرفت باید بین صفر تا صد باشد." }, { status: 400 });
      }
      const sets = entries.map(([key]) => `${taskColumns[key]} = ?`).join(", ");
      const values = entries.map(([, value]) => value === "" ? null : value);
      await db.prepare(`UPDATE tasks SET ${sets}, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE task_id = ?`)
        .bind(...values, current.user.displayName, body.id).run();
      await logActivity("task", body.id, "update", Object.fromEntries(entries), current.identity.userId);
      return Response.json({ ok: true });
    }

    if (body.entity === "issue" && typeof body.id === "number") {
      if (current.user.role === "مشاهده‌گر") return Response.json({ error: "دسترسی ویرایش ندارید." }, { status: 403 });
      const map: Record<string, string> = { taskId:"task_id", title:"title", description:"description", reporter:"reporter", severity:"severity", priority:"priority", status:"status", assignee:"assignee", deadline:"deadline", resolvedAt:"resolved_at", supervisorApproval:"supervisor_approval", operatorApproval:"operator_approval", retestNotes:"retest_notes" };
      const entries = Object.entries(updates).filter(([key]) => key in map);
      if (!entries.length) return Response.json({ error: "تغییری ارسال نشده است." }, { status: 400 });
      await db.prepare(`UPDATE issues SET ${entries.map(([k]) => `${map[k]} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(...entries.map(([,v]) => v === "" ? null : v), body.id).run();
      await logActivity("issue", String(body.id), "update", Object.fromEntries(entries), current.identity.userId);
      return Response.json({ ok: true });
    }

    if (body.entity === "meeting" && typeof body.id === "number") {
      if (!["مدیر پروژه","ناظر","بهره‌بردار"].includes(current.user.role)) return Response.json({ error: "دسترسی ویرایش ندارید." }, { status: 403 });
      const map: Record<string, string> = { meetingDate:"meeting_date", type:"type", subject:"subject", attendees:"attendees", decision:"decision", action:"action", owner:"owner", deadline:"deadline", status:"status", taskId:"task_id", documentUrl:"document_url" };
      const entries = Object.entries(updates).filter(([key]) => key in map);
      if (!entries.length) return Response.json({ error: "تغییری ارسال نشده است." }, { status: 400 });
      await db.prepare(`UPDATE meetings SET ${entries.map(([k]) => `${map[k]} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(...entries.map(([,v]) => v === "" ? null : v), body.id).run();
      await logActivity("meeting", String(body.id), "update", Object.fromEntries(entries), current.identity.userId);
      return Response.json({ ok: true });
    }

    if (body.entity === "user" && typeof body.id === "string") {
      if (current.user.role !== "مدیر پروژه") return Response.json({ error: "فقط مدیر پروژه می‌تواند نقش‌ها را تغییر دهد." }, { status: 403 });
      const role = String(updates.role ?? "") as ProjectRole;
      if (!roles.includes(role)) return Response.json({ error: "نقش نامعتبر است." }, { status: 400 });
      if (body.id === current.identity.userId) return Response.json({ error: "برای جلوگیری از قفل‌شدن سامانه، نقش خودتان را تغییر ندهید." }, { status: 400 });
      await db.prepare("UPDATE users SET role = ? WHERE user_id = ?").bind(role, body.id).run();
      await logActivity("user", body.id, "role-update", { role }, current.identity.userId);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const current = await auth(request);
    if (!current) return Response.json({ error: "ورود به سامانه الزامی است." }, { status: 401 });
    if (current.user.role === "مشاهده‌گر") return Response.json({ error: "دسترسی ثبت ندارید." }, { status: 403 });
    const body = await request.json() as { entity?: string; data?: Record<string, unknown> };
    const data = body.data ?? {};
    const db = getProjectDb();
    const token = Date.now().toString(36).toUpperCase();

    if (body.entity === "issue") {
      const issueId = `BUG-${token}`;
      const title = String(data.title ?? "").trim();
      if (!title) return Response.json({ error: "عنوان اشکال الزامی است." }, { status: 400 });
      await db.prepare(`INSERT INTO issues
        (issue_id, task_id, title, description, reporter, severity, priority, status, assignee, deadline, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(issueId, data.taskId || null, title, data.description || "", data.reporter || current.user.role,
          data.severity || "متوسط", data.priority || "متوسط", "باز", data.assignee || "پیمانکار", data.deadline || null, current.identity.userId).run();
      await logActivity("issue", issueId, "create", data, current.identity.userId);
      return Response.json({ ok: true, issueId }, { status: 201 });
    }
    if (body.entity === "meeting") {
      if (!["مدیر پروژه","ناظر","بهره‌بردار"].includes(current.user.role)) return Response.json({ error: "دسترسی ثبت جلسه ندارید." }, { status: 403 });
      const meetingId = `MTG-${token}`;
      const subject = String(data.subject ?? "").trim();
      if (!subject) return Response.json({ error: "موضوع جلسه الزامی است." }, { status: 400 });
      await db.prepare(`INSERT INTO meetings
        (meeting_id, meeting_date, type, subject, attendees, decision, action, owner, deadline, status, task_id, document_url, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(meetingId, data.meetingDate || null, data.type || "جلسه تحلیل", subject, data.attendees || "", data.decision || "",
          data.action || "", data.owner || "", data.deadline || null, data.status || "باز", data.taskId || null, data.documentUrl || "", current.identity.userId).run();
      await logActivity("meeting", meetingId, "create", data, current.identity.userId);
      return Response.json({ ok: true, meetingId }, { status: 201 });
    }
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
