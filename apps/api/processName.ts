// the name the api's entry runs under. the app service runs it as api, and the web service starts the same entry as web

import { readEnumSetting } from "@carlnotes/server/envSettings"

// the two names, which tell the two services' gauge lines and warnings apart
export type ApiProcessName = "api" | "web"

/**
 * Returns the process name that PROCESS_NAME sets: web, or api if it is unset. Any other value throws an error, so a
 * typo never files one service's lines under the other's name.
 */
export function readApiProcessName(value = Bun.env.PROCESS_NAME): ApiProcessName {
	return readEnumSetting({ settingName: "PROCESS_NAME", value, allowedValues: ["api", "web"], defaultValue: "api" })
}
