CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_entity` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` text NOT NULL,
	`task_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`reporter` text NOT NULL,
	`severity` text NOT NULL,
	`priority` text NOT NULL,
	`status` text DEFAULT 'باز' NOT NULL,
	`assignee` text DEFAULT 'پیمانکار' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deadline` text,
	`resolved_at` text,
	`supervisor_approval` text DEFAULT 'در انتظار' NOT NULL,
	`operator_approval` text DEFAULT 'در انتظار' NOT NULL,
	`retest_notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_issue_id_unique` ON `issues` (`issue_id`);--> statement-breakpoint
CREATE INDEX `idx_issues_task_status` ON `issues` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_issues_status` ON `issues` (`status`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` text NOT NULL,
	`meeting_date` text,
	`type` text NOT NULL,
	`subject` text NOT NULL,
	`attendees` text DEFAULT '' NOT NULL,
	`decision` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`deadline` text,
	`status` text DEFAULT 'باز' NOT NULL,
	`task_id` text,
	`document_url` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_meeting_id_unique` ON `meetings` (`meeting_id`);--> statement-breakpoint
CREATE INDEX `idx_meetings_status_date` ON `meetings` (`status`,`meeting_date`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`wbs` text NOT NULL,
	`domain` text NOT NULL,
	`title` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`source_page` text NOT NULL,
	`priority` text NOT NULL,
	`owner_type` text NOT NULL,
	`status` text DEFAULT 'بررسی نشده' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`planned_start` text,
	`deadline` text,
	`actual_end` text,
	`deliverable` text DEFAULT '' NOT NULL,
	`supervisor_approval` text DEFAULT 'در انتظار' NOT NULL,
	`supervisor_note` text DEFAULT '' NOT NULL,
	`operator_approval` text DEFAULT 'در انتظار' NOT NULL,
	`operator_note` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT '' NOT NULL,
	`next_owner` text DEFAULT '' NOT NULL,
	`next_deadline` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_domain` ON `tasks` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_tasks_deadline` ON `tasks` (`deadline`);--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'مشاهده‌گر' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_users_role` ON `users` (`role`);