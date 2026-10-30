// the app version gate: a mobile request from a build older than its platform's minimum is rejected with 426 and where to
// update, and every other request, the web's included, passes

import { APP_VERSION_OUTDATED_REJECTION, isAppVersionSupported } from "@carlnotes/contracts/appVersions"
import { isNativePlatform, PLATFORM_HEADER, toClientTelemetry } from "@carlnotes/contracts/clientTelemetry"
import { toMobileStoreUrl } from "@carlnotes/contracts/mobileApp"
import { appUrl } from "@carlnotes/server/appUrl"
import { createMiddleware } from "hono/factory"
import { loadCachedMobileMinimumVersions } from "./mobileMinimumVersions"

/**
 * Rejects a request from an outdated build with 426, the minimum it has to reach, and the platform's store url. A
 * request without a native platform or a readable version passes, as does one on a platform with no minimum.
 */
export const appVersionGate = createMiddleware(async (context, next) => {
	// pass everything but a native request with a readable version below its platform's minimum
	const platform = context.req.header(PLATFORM_HEADER)
	if (!isNativePlatform(platform)) {
		return next()
	}

	// compare the build against its platform's minimum
	const { appVersion } = toClientTelemetry((name) => context.req.header(name))
	const minimumVersion = (await loadCachedMobileMinimumVersions())[platform]
	if (isAppVersionSupported({ installedVersion: appVersion, minimumVersion })) {
		return next()
	}

	// return the minimum and the store url, uncached
	context.header("Cache-Control", "no-store")
	return context.json(
		{
			rejection: APP_VERSION_OUTDATED_REJECTION,
			minimumVersion: minimumVersion as string,
			storeUrl: toMobileStoreUrl(platform, appUrl()),
		},
		426,
	)
})
