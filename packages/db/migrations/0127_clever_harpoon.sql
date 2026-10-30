SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TYPE "public"."push_notification_kind" AS ENUM('topic-scan', 'chat-mention');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."push_receipt_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"expo_push_token" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"app_version" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_expo_push_token_unique" UNIQUE("expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "push_notification_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "push_notification_kind" NOT NULL,
	"scan_id" text,
	"room_message_id" bigint,
	"recipient_user_id" text NOT NULL,
	"push_device_id" text,
	"ticket_id" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"receipt_status" "push_receipt_status",
	"receipt_error" text,
	"receipt_checked_at" timestamp with time zone,
	CONSTRAINT "push_notification_sends_kind_shape" CHECK (("push_notification_sends"."kind" = 'topic-scan' and "push_notification_sends"."scan_id" is not null and "push_notification_sends"."room_message_id" is null) or ("push_notification_sends"."kind" = 'chat-mention' and "push_notification_sends"."room_message_id" is not null and "push_notification_sends"."scan_id" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_topic_push_enabled" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_chat_mention_push_enabled" boolean;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_sends" ADD CONSTRAINT "push_notification_sends_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_sends" ADD CONSTRAINT "push_notification_sends_room_message_id_room_messages_id_fk" FOREIGN KEY ("room_message_id") REFERENCES "public"."room_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_sends" ADD CONSTRAINT "push_notification_sends_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_sends" ADD CONSTRAINT "push_notification_sends_push_device_id_push_devices_id_fk" FOREIGN KEY ("push_device_id") REFERENCES "public"."push_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_devices_user_id_idx" ON "push_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_devices_session_id_idx" ON "push_devices" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_sends_scan_recipient_device_unique" ON "push_notification_sends" USING btree ("scan_id","recipient_user_id","push_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_sends_message_recipient_device_unique" ON "push_notification_sends" USING btree ("room_message_id","recipient_user_id","push_device_id");