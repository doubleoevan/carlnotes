// the muted line the Account screen ends with, naming the app version, build, and loaded update

import * as Application from "expo-application"
import * as Updates from "expo-updates"
import { toAppVersionLabel } from "@/appVersionLabel"
import { Text } from "@/components/primitives/text"

type AppVersionLineProps = {
	// the build's values, read from the device unless a story passes its own
	appVersion?: string | null
	nativeBuildVersion?: string | null
	updateId?: string | null
}

/**
 * Renders the version line as selectable text.
 */
export function AppVersionLine({
	appVersion = Application.nativeApplicationVersion,
	nativeBuildVersion = Application.nativeBuildVersion,
	updateId = Updates.updateId,
}: AppVersionLineProps) {
	return (
		<Text selectable className="pt-2 text-center text-xs text-muted-foreground">
			{toAppVersionLabel({ appVersion, nativeBuildVersion, updateId })}
		</Text>
	)
}
