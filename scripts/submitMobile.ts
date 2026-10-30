// the submit path's helpers: the platform from the arguments, the Doppler names each store needs, the environment
// eas submit reads them from, and the key files written for the length of the submit

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { isNativePlatform, type MobilePlatform } from "@carlnotes/contracts/clientTelemetry"

// the Doppler names a submit reads, by platform. the App Store Connect key and the Play service account arrive
// base64 encoded
export const SUBMIT_VALUE_NAMES: Record<MobilePlatform, readonly string[]> = {
	ios: ["ASC_APP_ID", "APPLE_TEAM_ID", "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_API_KEY_BASE64"],
	android: ["PLAY_SERVICE_ACCOUNT_BASE64"],
}

// where the Play key file sits for the length of the submit, the path the submit profile names
export const PLAY_SERVICE_ACCOUNT_PATH = "apps/mobile/play-service-account.json"

/**
 * Returns the platform the arguments name, or throws an error naming the flag.
 */
export function toSubmitPlatform(args: readonly string[]): MobilePlatform {
	// a flag with no value parses as true, which names no platform
	const { values } = parseArgs({
		args: [...args],
		options: { platform: { type: "string" } },
		allowPositionals: true,
		strict: false,
	})
	const platform = typeof values.platform === "string" ? values.platform : undefined
	if (!isNativePlatform(platform)) {
		throw new Error("name the platform: bun run mobile:submit -- --platform ios | android")
	}
	return platform
}

/**
 * Throws an error naming each Doppler value a platform's submit needs that the environment lacks.
 */
export function assertSubmitValues(platform: MobilePlatform, env: Record<string, string | undefined>): void {
	const missingNames = SUBMIT_VALUE_NAMES[platform].filter((name) => !env[name])
	if (missingNames.length > 0) {
		throw new Error(`the submit needs ${missingNames.join(", ")} in Doppler prd`)
	}
}

// what a platform's submit leaves behind: the environment eas submit reads, and the files to remove after
export type SubmitSetup = { env: Record<string, string>; keyFilePaths: string[] }

/**
 * Writes a platform's key file from its base64 value and returns the environment eas submit reads, with the paths to
 * remove once the submit ends.
 */
export function saveSubmitSetup(platform: MobilePlatform, env: Record<string, string | undefined>): SubmitSetup {
	// the App Store Connect key goes to a private temporary folder, and eas reads it through its own variables
	if (platform === "ios") {
		const keyFolder = mkdtempSync(join(tmpdir(), "carlnotes-asc-"))
		const keyFilePath = join(keyFolder, "AuthKey.p8")
		writeFileSync(keyFilePath, Buffer.from(env.ASC_API_KEY_BASE64 ?? "", "base64"), { mode: 0o600 })
		return {
			env: {
				EXPO_ASC_APP_ID: env.ASC_APP_ID ?? "",
				EXPO_APPLE_TEAM_ID: env.APPLE_TEAM_ID ?? "",
				EXPO_ASC_KEY_ID: env.ASC_KEY_ID ?? "",
				EXPO_ASC_ISSUER_ID: env.ASC_ISSUER_ID ?? "",
				EXPO_ASC_API_KEY_PATH: keyFilePath,
			},
			keyFilePaths: [keyFolder],
		}
	}

	// the Play service account goes where the submit profile's path points
	writeFileSync(PLAY_SERVICE_ACCOUNT_PATH, Buffer.from(env.PLAY_SERVICE_ACCOUNT_BASE64 ?? "", "base64"), {
		mode: 0o600,
	})
	return { env: {}, keyFilePaths: [PLAY_SERVICE_ACCOUNT_PATH] }
}

/**
 * Removes each key file or folder a setup wrote.
 */
export function removeSubmitKeyFiles({ keyFilePaths }: SubmitSetup): void {
	for (const keyFilePath of keyFilePaths) {
		rmSync(keyFilePath, { recursive: true, force: true })
	}
}
