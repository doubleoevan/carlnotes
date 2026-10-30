// the push contracts: a phone's registration, the account's push preferences, and the data a push notification
// includes for the app to open
import { z } from "zod"
import { MOBILE_PLATFORMS } from "./clientTelemetry"
import { pushNotificationKinds } from "./enums"

// an Expo push token as the app reads it
export const EXPO_PUSH_TOKEN_PATTERN = /Expo(?:nent)?PushToken\[[^\]\s]+\]/

// the longest app version the api stores, well over any real version string
const APP_VERSION_MAX_CHARS = 32

// the longest token the api stores, several times an Expo token's length
const EXPO_PUSH_TOKEN_MAX_CHARS = 256

// an Expo push token, matched whole
const expoPushToken = z
	.string()
	.max(EXPO_PUSH_TOKEN_MAX_CHARS)
	.regex(new RegExp(`^${EXPO_PUSH_TOKEN_PATTERN.source}$`))

// a phone's registration: its token, its platform and app version, and the token it read before, if the token rotated
export const pushDevicePayload = z.object({
	expoPushToken,
	platform: z.enum(MOBILE_PLATFORMS),
	appVersion: z.string().trim().min(1).max(APP_VERSION_MAX_CHARS),
	previousExpoPushToken: expoPushToken.optional(),
})

export type PushDevicePayload = z.infer<typeof pushDevicePayload>

// the phone to unregister, by its token
export const pushDeviceDeletePayload = z.object({ expoPushToken })

// one push preference to save: a kind of push turned on or off
export const pushPreferencePayload = z.object({ kind: z.enum(pushNotificationKinds), isEnabled: z.boolean() })

export type PushNotificationKind = (typeof pushNotificationKinds)[number]

// the Android notification channel each kind posts to
export const PUSH_CHANNEL_IDS: Record<PushNotificationKind, string> = {
	"topic-scan": "topic-scans",
	"chat-mention": "chat-mentions",
}

// the data a push includes: its kind, the site link that it opens, and the account it was sent to
export const pushNotificationData = z.object({
	kind: z.enum(pushNotificationKinds),
	url: z.string(),
	recipientUserId: z.string(),
})

export type PushNotificationData = z.infer<typeof pushNotificationData>
