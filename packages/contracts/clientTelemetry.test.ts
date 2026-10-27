import { expect, test } from "bun:test"
import { toClientTelemetry, toClientTelemetryHeaders } from "./clientTelemetry"

// native requests retain their device description even when their user agent names only CFNetwork
test("native device headers round-trip for iOS and Android", () => {
	for (const browserPlatform of ["ios", "android"] as const) {
		const properties = {
			entryPoint: "mobile",
			platform: "mobile",
			browserPlatform,
			isInAppBrowser: false,
			deviceModel: "iPhone 18 Pro",
			osVersion: "27.0",
			appVersion: "1.0.0",
			appBuild: "1",
		} as const
		const headers = toClientTelemetryHeaders(properties)
		expect(toClientTelemetry((name) => headers[name])).toEqual(properties)
	}
})

// browser classification remains unchanged and native labels cannot carry unbounded data
test("unrecognized platforms fall back to user agent and malformed descriptions are omitted", () => {
	const headers = new Headers({
		"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
		"x-carlnotes-platform": "web",
	})
	expect(toClientTelemetry((name) => headers.get(name))).toEqual({
		entryPoint: "web",
		platform: "mobile",
		browserPlatform: "ios",
		isInAppBrowser: false,
	})
	headers.set("x-carlnotes-platform", "ios")
	headers.set("x-carlnotes-device-model", "https://private.example/notes?token=secret")
	headers.set("x-carlnotes-app-version", "x".repeat(81))
	expect(toClientTelemetry((name) => headers.get(name))).toEqual({
		entryPoint: "mobile",
		platform: "mobile",
		browserPlatform: "ios",
		isInAppBrowser: false,
	})
})
