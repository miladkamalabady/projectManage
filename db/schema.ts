import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("مشاهده‌گر"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_users_role").on(table.role)]);

export const tasks = sqliteTable("tasks", {
  taskId: text("task_id").primaryKey(), wbs: text("wbs").notNull(),
  domain: text("domain").notNull(), title: text("title").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(), sourcePage: text("source_page").notNull(),
  priority: text("priority").notNull(), ownerType: text("owner_type").notNull(),
  status: text("status").notNull().default("بررسی نشده"), progress: integer("progress").notNull().default(0),
  plannedStart: text("planned_start"), deadline: text("deadline"), actualEnd: text("actual_end"),
  deliverable: text("deliverable").notNull().default(""),
  supervisorApproval: text("supervisor_approval").notNull().default("در انتظار"),
  supervisorNote: text("supervisor_note").notNull().default(""),
  operatorApproval: text("operator_approval").notNull().default("در انتظار"),
  operatorNote: text("operator_note").notNull().default(""),
  nextAction: text("next_action").notNull().default(""), nextOwner: text("next_owner").notNull().default(""),
  nextDeadline: text("next_deadline"), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").notNull().default(""),
}, (table) => [index("idx_tasks_status").on(table.status), index("idx_tasks_domain").on(table.domain), index("idx_tasks_deadline").on(table.deadline)]);

export const issues = sqliteTable("issues", {
  id: integer("id").primaryKey({ autoIncrement: true }), issueId: text("issue_id").notNull().unique(),
  taskId: text("task_id"), title: text("title").notNull(), description: text("description").notNull().default(""),
  reporter: text("reporter").notNull(), severity: text("severity").notNull(), priority: text("priority").notNull(),
  status: text("status").notNull().default("باز"), assignee: text("assignee").notNull().default("پیمانکار"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), deadline: text("deadline"), resolvedAt: text("resolved_at"),
  supervisorApproval: text("supervisor_approval").notNull().default("در انتظار"),
  operatorApproval: text("operator_approval").notNull().default("در انتظار"),
  retestNotes: text("retest_notes").notNull().default(""), createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_issues_task_status").on(table.taskId, table.status), index("idx_issues_status").on(table.status)]);

export const meetings = sqliteTable("meetings", {
  id: integer("id").primaryKey({ autoIncrement: true }), meetingId: text("meeting_id").notNull().unique(),
  meetingDate: text("meeting_date"), type: text("type").notNull(), subject: text("subject").notNull(),
  attendees: text("attendees").notNull().default(""), decision: text("decision").notNull().default(""),
  action: text("action").notNull().default(""), owner: text("owner").notNull().default(""), deadline: text("deadline"),
  status: text("status").notNull().default("باز"), taskId: text("task_id"), documentUrl: text("document_url").notNull().default(""),
  createdBy: text("created_by").notNull(), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_meetings_status_date").on(table.status, table.meetingDate)]);

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }), entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(), action: text("action").notNull(), payload: text("payload").notNull().default("{}"),
  userId: text("user_id").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_activity_entity").on(table.entityType, table.entityId)]);
