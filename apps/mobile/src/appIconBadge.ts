// the app icon's badge, the web tab title's unread count: the same sum of chat mentions, note changes, and topic
// invitations the badge poll last read, cleared for a visitor and on sign-out
import { useAllUpdateBadges } from "@carlnotes/core/hooks/useUpdateCounts"
import { toUpdateCount } from "@carlnotes/core/lib/updateCounts"
import * as Notifications from "expo-notifications"
import { useEffect } from "react"
import { Platform } from "react-native"

/**
 * Keeps the app icon's badge at the signed-in account's update count, and at nothing for a visitor. It renders
 * nothing, so the badge stores re-render this leaf alone on each poll.
 */
export function AppIconBadge({ userId }: { userId: string | null }): null {
	const updateCount = toUpdateCount(useAllUpdateBadges())
	useEffect(() => {
		void showAppIconBadge(userId ? updateCount : 0)
	}, [userId, updateCount])
	return null
}

// set the badge if the phone allows it. a refused or undetermined permission leaves the icon bare
async function showAppIconBadge(count: number): Promise<void> {
	try {
		if (count > 0 && !(await canShowAppIconBadge())) {
			return
		}

		// the count, or no badge for zero
		await Notifications.setBadgeCountAsync(count)
	} catch (error) {
		console.error("app icon badge failed", error)
	}
}

// iOS badges only with the notification permission's badge setting. Android launchers badge the icon without one
async function canShowAppIconBadge(): Promise<boolean> {
	if (Platform.OS !== "ios") {
		return true
	}
	const permissions = await Notifications.getPermissionsAsync()
	return permissions.ios?.allowsBadge === true
}
