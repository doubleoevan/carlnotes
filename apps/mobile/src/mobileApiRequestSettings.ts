import { markAppVersionOutdated } from "@carlnotes/core/stores/appUpdateStore"
import { toApiRequestSettings } from "./apiRequestSettings"
import { hasSession, mobileAuthClient, retireCurrentSession } from "./authClient"
import { deviceTelemetryHeaders } from "./deviceTelemetry"

// share the same current cookie, device headers, one-per-session unauthorized handler, and update notice with fetch
// and SSE
export const mobileApiRequestSettings = toApiRequestSettings({
	getCookie: () => mobileAuthClient.getCookie(),
	deviceHeaders: deviceTelemetryHeaders,
	hasSession,
	onAppVersionOutdated: markAppVersionOutdated,
	signOut: async () => {
		// retire the current session before signing out
		await retireCurrentSession()
		return mobileAuthClient.signOut()
	},
})
