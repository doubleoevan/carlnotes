// push rule tests: what a permission read means on each platform, and a registration that names the token it replaced
// only if the token changed
import { expect, test } from "bun:test"
import { toPushDevicePayload, toPushPermission } from "./pushRules"

// never asked, refused, and allowed read as such, and an iOS grant without alerts reads as refused
test("a permission read becomes allowed, refused, or never asked", () => {
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
