import { type DeviceProperties, toDeviceProperties } from "./userAgent"

// device descriptions are telemetry only. they never grant access or prove a caller's platform
export type ClientTelemetry = DeviceProperties & {
	entryPoint: "web" | "mobile"
	osVersion?: string
	deviceModel?: string
	appVersion?: string
	appBuild?: string
}

// the bounded device descriptions both native requests and server reports use
const DEVICE_HEADERS = {
	osVersion: "x-carlnotes-os-version",
	deviceModel: "x-carlnotes-device-model",
	appVersion: "x-carlnotes-app-version",
	appBuild: "x-carlnotes-app-build",
} as const

// the header that names the app's platform on every request, and its two values
export const PLATFORM_HEADER = "x-carlnotes-platform"

/**
 * Returns true if a platform header value names one of the two native platforms.
 */
export function isNativePlatform(platform: string | null | undefined): platform is "ios" | "android" {
	return platform === "ios" || platform === "android"
}

/**
 * Returns bounded native telemetry or browser user-agent properties.
 */
export function toClientTelemetry(readHeader: (name: string) => string | null | undefined): ClientTelemetry {
	// accept only the two native platforms
	const platform = readHeader(PLATFORM_HEADER)
	if (!isNativePlatform(platform)) {
		return { entryPoint: "web", ...toDeviceProperties(readHeader("user-agent")) }
	}

	// keep descriptive values short and omit malformed headers
	const descriptions = Object.fromEntries(
		Object.entries(DEVICE_HEADERS).flatMap(([property, header]) => {
			const value = readHeader(header)
			return value && /^[a-zA-Z0-9 ._(),+-]{1,80}$/.test(value) ? [[property, value]] : []
		}),
	)
	return { entryPoint: "mobile", platform: "mobile", browserPlatform: platform, isInAppBrowser: false, ...descriptions }
}

/**
 * Builds native device-description headers without an installation identifier.
 */
export function toClientTelemetryHeaders(properties: ClientTelemetry): Record<string, string> {
	return {
		[PLATFORM_HEADER]: properties.browserPlatform,
		...Object.fromEntries(
			Object.entries(DEVICE_HEADERS).flatMap(([property, header]) => {
				const value = properties[property as keyof typeof DEVICE_HEADERS]
				return value ? [[header, value]] : []
			}),
		),
	}
}
