// the blocking notice a build older than its platform's minimum sees over every screen, with the store button and
// Check again

import { APP_UPDATE_COPY, toAppUpdateBody } from "@carlnotes/contracts/appVersions"
import { toMobileStoreUrl } from "@carlnotes/contracts/mobileApp"
import { SITE_URL } from "@carlnotes/contracts/site"
import { clearAppUpdateRequirement } from "@carlnotes/core/stores/appUpdateStore"
import { useQueryClient } from "@tanstack/react-query"
import * as Linking from "expo-linking"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { MOBILE_PLATFORM } from "@/deviceTelemetry"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { SessionScreen } from "./SessionScreen"

type AppUpdateNoticeProps = {
	minimumVersion: string | null
}

/**
 * Renders the blocking update notice: Carl's words, the store button, and Check again, which clears the notice and
 * reloads every read.
 */
export function AppUpdateNotice({ minimumVersion }: AppUpdateNoticeProps) {
	const queryClient = useQueryClient()

	// clear the notice and read again
	function handleCheckAgain(): void {
		clearAppUpdateRequirement()
		void queryClient.invalidateQueries()
	}

	return (
		<SessionScreen>
			<View className="gap-4" accessibilityLiveRegion="polite">
				{/* the title and Carl's words */}
				<Text accessibilityRole="header" style={toTypeRoleStyle("pageTitle")} className="text-center text-foreground">
					{APP_UPDATE_COPY.title}
				</Text>
				<Text style={toTypeRoleStyle("body")} className="text-center text-muted-foreground">
					{toAppUpdateBody(minimumVersion)}
				</Text>
				{/* the store button, then Check again */}
				<Button
					accessibilityLabel={APP_UPDATE_COPY.update}
					onPress={() => void Linking.openURL(toMobileStoreUrl(MOBILE_PLATFORM, SITE_URL))}
				>
					<Text>{APP_UPDATE_COPY.update}</Text>
				</Button>
				<Button variant="ghost" accessibilityLabel={APP_UPDATE_COPY.checkAgain} onPress={handleCheckAgain}>
					<Text>{APP_UPDATE_COPY.checkAgain}</Text>
				</Button>
			</View>
		</SessionScreen>
	)
}
