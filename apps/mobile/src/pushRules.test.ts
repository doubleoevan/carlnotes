// push rule tests: what a permission read means on each platform, a registration that names the token it replaced
// only if the token changed, and a token report that registers again only for a changed token
import { expect, test } from "bun:test"
import { toPushDevicePayload, toPushPermission, toPushTokenRegistration } from "./pushRules"

// never asked, denied, and allowed read as such, and an iOS grant without alerts reads as denied
test("a permission read becomes allowed, denied, or never asked", () => {
	expect(toPushPermission({ status: "undetermined" } as never, "ios")).toBe("undetermined")
	expect(toPushPermission({ status: "denied" } as never, "android")).toBe("denied")
	expect(toPushPermission({ status: "granted" } as never, "android")).toBe("granted")
	expect(toPushPermission({ status: "granted", ios: { allowsAlert: true } } as never, "ios")).toBe("granted")
	expect(toPushPermission({ status: "granted", ios: { allowsAlert: false } } as never, "ios")).toBe("denied")
})

// a first registration and a repeat name no previous token, and a rotated token names the one it replaces
test("a registration names the previous token only after a rotation", () => {
	// the same token registered again
	const repeatPayload = toPushDevicePayload({
		expoPushToken: "ExponentPushToken[a]",
		previousExpoPushToken: "ExponentPushToken[a]",
		platform: "ios",
		appVersion: undefined,
	})
	expect(repeatPayload).toEqual({ expoPushToken: "ExponentPushToken[a]", platform: "ios", appVersion: "0.0.0" })

	// a rotated token
	const rotatedPayload = toPushDevicePayload({
		expoPushToken: "ExponentPushToken[b]",
		previousExpoPushToken: "ExponentPushToken[a]",
		platform: "android",
		appVersion: "0.2.0",
	})
	expect(rotatedPayload.previousExpoPushToken).toBe("ExponentPushToken[a]")
})

// iOS reports the token on every read, so a registration's own read must not start another registration
test("a token report registers again only for a changed token, never for a registration's own read", async () => {
	// a registration that reads the token, which reports it the way iOS does, while the registration runs
	let registrationCount = 0
	let reportedToken = "token-a"
	const pushTokenRegistration = toPushTokenRegistration(async () => {
		registrationCount += 1
		pushTokenRegistration.handlePushToken({ data: reportedToken })
		await Promise.resolve()
	})

	// the opening registration reports its own token, which registers nothing more
	await pushTokenRegistration.register()
	expect(registrationCount).toBe(1)

	// a repeat of the token outside a registration is no change
	pushTokenRegistration.handlePushToken({ data: "token-a" })
	await Promise.resolve()
	expect(registrationCount).toBe(1)

	// a rotated token registers once, and its own read reports the same token
	reportedToken = "token-b"
	pushTokenRegistration.handlePushToken({ data: "token-b" })
	await Promise.resolve()
	expect(registrationCount).toBe(2)
})
