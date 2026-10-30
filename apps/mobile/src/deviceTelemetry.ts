import {
	type ClientTelemetry,
	type MobilePlatform,
	toClientTelemetryHeaders,
} from "@carlnotes/contracts/clientTelemetry"
import * as Application from "expo-application"
import * as Device from "expo-device"
import { Platform } from "react-native"

// the device's platform. a development build on another platform counts as Android
export const MOBILE_PLATFORM: MobilePlatform = Platform.OS === "ios" ? "ios" : "android"

// descriptive device context. no advertising, vendor, installation, or account identifier
export const deviceTelemetry: ClientTelemetry = {
	entryPoint: "mobile",
	platform: "mobile",
	browserPlatform: MOBILE_PLATFORM,
	isInAppBrowser: false,
	osVersion: Device.osVersion ?? undefined,
	deviceModel: Device.modelName ?? undefined,
	appVersion: Application.nativeApplicationVersion ?? undefined,
	appBuild: Application.nativeBuildVersion ?? undefined,
}

// the same metadata follows authenticated api and sign-in requests
export const deviceTelemetryHeaders = toClientTelemetryHeaders(deviceTelemetry)
