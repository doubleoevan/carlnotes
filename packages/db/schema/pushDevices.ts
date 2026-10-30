// the push tables: the phones that receive a signed-in user's push notifications, and the pushes sent to them
import { sql } from "drizzle-orm"
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { chatRoomMessages } from "./chat"
import { primaryId, pushNotificationKind, pushPlatform, pushReceiptStatus, timestamps } from "./columns"
import { scans } from "./scans"
import { sessions, users } from "./users"

// one phone's Expo push token, bound to the session that registered it. ending the session or closing the account
// deletes the row, and a second account that registers the same token takes the row over
export const pushDevices = pgTable(
	"push_devices",
	{
		id: primaryId(),
		// the Expo push token, one row per phone
		expoPushToken: text("expo_push_token").notNull().unique(),
		// the account and the session that registered the phone
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sessionId: text("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		// the phone's platform and app version, and when it last registered
		platform: pushPlatform("platform").notNull(),
		appVersion: text("app_version").notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
		// created and updated timestamps
		...timestamps(),
	},
	// the delivery reads a user's phones, and an ended session's cascade finds its phone
	(table) => [
		index("push_devices_user_id_idx").on(table.userId),
		index("push_devices_session_id_idx").on(table.sessionId),
	],
)

// one push that the push service accepted for one phone, about a Scan or a room message, and its receipt once read
export const pushNotificationSends = pgTable(
	"push_notification_sends",
	{
		id: primaryId(),
		// what the push is about: a Scan's new Findings or a chat mention
		kind: pushNotificationKind("kind").notNull(),
		scanId: text("scan_id").references(() => scans.id, { onDelete: "cascade" }),
		roomMessageId: bigint("room_message_id", { mode: "number" }).references(() => chatRoomMessages.id, {
			onDelete: "cascade",
		}),
		// who the push was for, and the phone it went to. a retired phone leaves its sends with no phone
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		pushDeviceId: text("push_device_id").references(() => pushDevices.id, { onDelete: "set null" }),
		// the push service's ticket, which its receipt is read by
		ticketId: text("ticket_id").notNull(),
		sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
		// the receipt, null until it is read, with its error code if it failed
		receiptStatus: pushReceiptStatus("receipt_status"),
		receiptError: text("receipt_error"),
		receiptCheckedAt: timestamp("receipt_checked_at", { withTimezone: true }),
	},
	// a topic-scan push names its Scan and a chat-mention push its room message. one row per event, recipient, and
	// phone
	(table) => [
		check(
			"push_notification_sends_kind_shape",
			sql`(${table.kind} = 'topic-scan' and ${table.scanId} is not null and ${table.roomMessageId} is null) or (${table.kind} = 'chat-mention' and ${table.roomMessageId} is not null and ${table.scanId} is null)`,
		),
		uniqueIndex("push_notification_sends_scan_recipient_device_unique").on(
			table.scanId,
			table.recipientUserId,
			table.pushDeviceId,
		),
		uniqueIndex("push_notification_sends_message_recipient_device_unique").on(
			table.roomMessageId,
			table.recipientUserId,
			table.pushDeviceId,
		),
		index("push_notification_sends_push_device_id_idx")
			.on(table.pushDeviceId)
			.where(sql`${table.pushDeviceId} is not null`),
		index("push_notification_sends_recipient_user_id_idx").on(table.recipientUserId),
	],
)
