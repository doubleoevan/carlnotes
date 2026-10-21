// the analytics properties that a test, a smoke check, or an eval passes where a request's own would go
import type { AnalyticsProperties } from "./currentUser"

// a free user on the web, on a desktop with no named browser platform
export const TEST_ANALYTICS_PROPERTIES: AnalyticsProperties = {
	entryPoint: "web",
	plan: "free",
	platform: "desktop",
	browserPlatform: "other",
	isInAppBrowser: false,
}
