// tests for the push contracts: the tokens a registration accepts, and the preference and push data shapes
import { expect, test } from "bun:test"
import { pushDevicePayload, pushNotificationData, pushPreferencePayload } from "./pushDevices"

// a phone's registration as the app sends it
const registration = { expoPushToken: "ExponentPushToken[abc123]", platform: "ios", appVersion: "0.2.0" }

// both token shapes Expo issues pass, with or without the token read before
test("a registration accepts an Expo push token and a rotated one", () => {
	expect(pushDevicePayload.parse(registration).expoPushToken).toBe("ExponentPushToken[abc123]")
	expect(
		pushDevicePayload.parse({
			...registration,
			expoPushToken: "ExpoPushToken[def]",
			previousExpoPushToken: "ExpoPushToken[abc]",
		}).previousExpoPushToken,
	).toBe("ExpoPushToken[abc]")
})

// a token that is not Expo's, a token inside other text, an unknown platform, and an empty version are rejected
test("a registration rejects anything but a whole Expo push token on a known platform", () => {
	expect(pushDevicePayload.safeParse({ ...registration, expoPushToken: "fcm-raw-token" }).success).toBe(false)
	expect(pushDevicePayload.safeParse({ ...registration, expoPushToken: "x ExponentPushToken[a]" }).success).toBe(false)
	expect(pushDevicePayload.safeParse({ ...registration, platform: "web" }).success).toBe(false)
	expect(
		pushDevicePayload.safeParse({ ...registration, expoPushToken: `ExponentPushToken[${"a".repeat(300)}]` }).success,
	).toBe(false)
	expect(pushDevicePayload.safeParse({ ...registration, appVersion: " " }).success).toBe(false)
})

// a preference names one kind, and push data names its kind, its link, and its account
test("a preference and push data parse only with a known kind", () => {
	expect(pushPreferencePayload.parse({ kind: "chat-mention", isEnabled: false })).toEqual({
		kind: "chat-mention",
		isEnabled: false,
	})
	expect(pushPreferencePayload.safeParse({ kind: "digest", isEnabled: true }).success).toBe(false)
	expect(
		pushNotificationData.safeParse({ kind: "topic-scan", url: "https://carlnotes.com/topics/t", recipientUserId: "u" })
			.success,
	).toBe(true)
	expect(pushNotificationData.safeParse({ kind: "topic-scan", url: "https://carlnotes.com" }).success).toBe(false)
})
