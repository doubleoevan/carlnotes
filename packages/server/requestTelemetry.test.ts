import { expect, test } from "bun:test"
import { toClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import * as Sentry from "@sentry/bun"
import { withRequestTelemetry } from "./monitoring"

// simultaneous native and browser requests must retain their own tags through asynchronous work
test("request device tags stay isolated across concurrent requests", async () => {
	// initialize the SDK's asynchronous context with an in-memory transport
	const previousClient = Sentry.getClient()
	Sentry.init({
		dsn: "https://test@example.com/1",
		defaultIntegrations: false,
		transport: () => ({ send: async () => ({ statusCode: 200 }), flush: async () => true }),
	})
	try {
		const initialTags = Sentry.getIsolationScope().getScopeData().tags
		const platforms = ["ios", "android", "web"] as const
		const results = await Promise.all(
			platforms.map((platform) =>
				withRequestTelemetry(
					toClientTelemetry((name) => (name === "x-carlnotes-platform" ? platform : undefined)),
					async () => {
						await Bun.sleep(1)
						return Sentry.getIsolationScope().getScopeData().tags
					},
				),
			),
		)
		expect(results.map(({ entryPoint, browserPlatform }) => ({ entryPoint, browserPlatform }))).toEqual([
			{ entryPoint: "mobile", browserPlatform: "ios" },
			{ entryPoint: "mobile", browserPlatform: "android" },
			{ entryPoint: "web", browserPlatform: "other" },
		])
		expect(Sentry.getIsolationScope().getScopeData().tags).toEqual(initialTags)
	} finally {
		await Sentry.close()
		Sentry.getCurrentScope().setClient(previousClient)
	}
})
