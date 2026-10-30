// the push routes: a signed-in phone registers its Expo push token for its session and unregisters it, and the user
// turns each kind of push on or off
import { pushDeviceDeletePayload, pushDevicePayload, pushPreferencePayload } from "@carlnotes/contracts/pushDevices"
import { db } from "@carlnotes/db"
import { pushDevices } from "@carlnotes/db/schema/pushDevices"
import { users } from "@carlnotes/db/schema/users"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq, notInArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentSessionId, currentUser } from "./currentUser"
import { pushDeviceRateLimiter } from "./rateLimit"
import { refreshSessionUser } from "./sessions"

// the most phones one account keeps registered. a registration past it retires the account's phones seen longest ago
const MAX_PUSH_DEVICES_PER_USER = 10

// the push routes, mounted on the api tree
export const pushDevicesRoute = new Hono<AppEnv>()
	.post("/push-devices", pushDeviceRateLimiter, zValidator("json", pushDevicePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		const sessionId = currentSessionId(context)
		if (!userId || !sessionId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// bind the token to this session, and turn on each push preference the user never chose
		const pushDevicePayload = context.req.valid("json")
		const sessionUser = context.get("user")
		const hasUnchosenPushPreference =
			sessionUser?.isTopicPushEnabled == null || sessionUser.isChatMentionPushEnabled == null
		const isPushPreferenceChanged = await db.transaction(async (transaction) => {
			// delete a rotated token's previous row if this session registered it
			if (
				pushDevicePayload.previousExpoPushToken &&
				pushDevicePayload.previousExpoPushToken !== pushDevicePayload.expoPushToken
			) {
				await transaction
					.delete(pushDevices)
					.where(
						and(
							eq(pushDevices.expoPushToken, pushDevicePayload.previousExpoPushToken),
							eq(pushDevices.sessionId, sessionId),
						),
					)
			}

			// move the token's row to this account and session
			const pushDeviceColumns = {
				userId,
				sessionId,
				platform: pushDevicePayload.platform,
				appVersion: pushDevicePayload.appVersion,
				lastSeenAt: new Date(),
			}
			await transaction
				.insert(pushDevices)
				.values({ expoPushToken: pushDevicePayload.expoPushToken, ...pushDeviceColumns })
				.onConflictDoUpdate({ target: pushDevices.expoPushToken, set: pushDeviceColumns })

			// select the account's phones seen most recently
			const recentPushDeviceIds = transaction
				.select({ id: pushDevices.id })
				.from(pushDevices)
				.where(eq(pushDevices.userId, userId))
				.orderBy(desc(pushDevices.lastSeenAt))
				.limit(MAX_PUSH_DEVICES_PER_USER)

			// retire the account's other phones
			await transaction
				.delete(pushDevices)
				.where(and(eq(pushDevices.userId, userId), notInArray(pushDevices.id, recentPushDeviceIds)))

			// the first grant turns both kinds on, and a kind turned off stays off. once both are chosen there is nothing
			// to write
			if (!hasUnchosenPushPreference) {
				return false
			}
			await transaction
				.update(users)
				.set({
					isTopicPushEnabled: sql`coalesce(${users.isTopicPushEnabled}, true)`,
					isChatMentionPushEnabled: sql`coalesce(${users.isChatMentionPushEnabled}, true)`,
				})
				.where(eq(users.id, userId))
			return true
		})

		// refresh the sessions if a preference changed
		if (isPushPreferenceChanged) {
			await refreshSessionUser(userId)
		}
		return context.json({ ok: true })
	})
	.delete("/push-devices", pushDeviceRateLimiter, zValidator("json", pushDeviceDeletePayload), async (context) => {
		// reject a signed-out visitor
		const sessionId = currentSessionId(context)
		if (!currentUser(context) || !sessionId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// remove the token only if this session registered it
		const { expoPushToken } = context.req.valid("json")
		await db
			.delete(pushDevices)
			.where(and(eq(pushDevices.expoPushToken, expoPushToken), eq(pushDevices.sessionId, sessionId)))
		return context.json({ ok: true })
	})
	.post("/users/me/push-preferences", zValidator("json", pushPreferencePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// save the one kind's push preference, then refresh the user's sessions
		const { kind, isEnabled } = context.req.valid("json")
		const pushPreference =
			kind === "topic-scan" ? { isTopicPushEnabled: isEnabled } : { isChatMentionPushEnabled: isEnabled }
		await db.update(users).set(pushPreference).where(eq(users.id, userId))
		await refreshSessionUser(userId)
		return context.json({ ok: true })
	})
