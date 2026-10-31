import { authClient } from "@carlnotes/client/authClient"
import { PUSH_PERMISSION_SHEET } from "@carlnotes/core/lib/pushCopy"
import * as Notifications from "expo-notifications"
import { router, useGlobalSearchParams, usePathname } from "expo-router"
import { useEffect, useRef } from "react"
import { AppState, View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { isPushForAccount, isPushForPath, toPushOpenPath } from "@/pushNotificationRouting"
import { closePushPermissionSheet, useIsPushPermissionSheetOpen, usePushPermission } from "@/pushPermission"
import { registerPushDevice } from "@/pushRegistration"
import { toPushTokenRegistration } from "@/pushRules"

// the path on screen with its room's team, read by the foreground handler, which runs outside React
let shownPath = "/"

// the pushes already opened, so a remount never opens one twice
const openedPushIds = new Set<string>()

// a push in the foreground shows its banner unless it is for the screen already open, and never sets the badge
Notifications.setNotificationHandler({
	handleNotification: async (notification) => {
		const isShown = !isPushForPath(notification.request.content.data, shownPath)
		return { shouldShowBanner: isShown, shouldShowList: isShown, shouldPlaySound: isShown, shouldSetBadge: false }
	},
})

/**
 * Registers the phone for the signed-in session while the phone allows notifications, again after a token change,
 * and opens a push the user taps, whether the app was open, in the background, or closed. It renders nothing.
 */
export function PushNotifications({ userId }: { userId: string | null }): null {
	// the signed-in user's session, which the phone registers for, and none for a visitor or a retired session
	const { data: session } = authClient().useSession()
	const sessionId = userId ? (session?.session.id ?? null) : null
	// whether a preference is still unchosen, read by a registration without registering again when it changes
	const hasUnchosenPushPreferenceRef = useRef(false)
	hasUnchosenPushPreferenceRef.current =
		session?.user.isTopicPushEnabled == null || session.user.isChatMentionPushEnabled == null

	// the path the foreground handler compares a push against, with the team of a Topic room on display
	const pathname = usePathname()
	const { chatTeamId } = useGlobalSearchParams<{ chatTeamId?: string }>()
	useEffect(() => {
		shownPath = chatTeamId ? `${pathname}?chatTeamId=${chatTeamId}` : pathname
	}, [pathname, chatTeamId])

	// a session on a phone that allows notifications registers, again whenever the token changes, and again on each
	// return to the foreground until a registration reaches the api
	const pushPermission = usePushPermission()
	useEffect(() => {
		if (!sessionId || pushPermission !== "granted") {
			return
		}
		// register now, with the token listener that registers again only for a changed token
		let isRegistered = false
		const { register, handlePushToken } = toPushTokenRegistration(async () => {
			isRegistered = await registerPushDevice()

			// the first registration turns the preferences on, so the session reads them again for the account's switches
			if (isRegistered && hasUnchosenPushPreferenceRef.current) {
				authClient().$store.notify("$sessionSignal")
			}
		})
		void register()

		// a changed token, and a foreground return after a failed registration, register again. a token report that a
		// registration's own read sends on iOS registers nothing
		const tokenSubscription = Notifications.addPushTokenListener(handlePushToken)
		const appStateSubscription = AppState.addEventListener("change", (appState) => {
			if (appState === "active" && !isRegistered) {
				void register()
			}
		})
		return () => {
			tokenSubscription.remove()
			appStateSubscription.remove()
		}
	}, [sessionId, pushPermission])

	// the push the user opened, from a cold start or from the background, goes to its page for this account only. a
	// push opened while signed out waits for a sign-in
	const notificationResponse = Notifications.useLastNotificationResponse()
	useEffect(() => {
		const pushId = notificationResponse?.notification.request.identifier
		if (!notificationResponse || !pushId || !userId || openedPushIds.has(pushId)) {
			return
		}

		// a push for another account opens Home and stays unopened, so its own account still opens it after a sign-in
		const pushData = notificationResponse.notification.request.content.data
		if (isPushForAccount(pushData, userId)) {
			openedPushIds.add(pushId)
		}
		router.push(toPushOpenPath(pushData, userId))
	}, [notificationResponse, userId])
	return null
}

/**
 * Explains the notifications before the system asks, after a first follow or room visit. Each choice closes it for
 * good on this phone.
 */
export function PushPermissionSheet() {
	const isOpen = useIsPushPermissionSheetOpen()
	if (!isOpen) {
		return null
	}
	return <PushPermissionPrompt onChoose={(isAccepted) => void closePushPermissionSheet(isAccepted)} />
}

/**
 * Shows the sheet's words and its two choices. Closing the sheet counts as Not now.
 */
export function PushPermissionPrompt({ onChoose }: { onChoose: (isAccepted: boolean) => void }) {
	return (
		<Sheet title={PUSH_PERMISSION_SHEET.title} onClose={() => onChoose(false)}>
			<View className="gap-4">
				<Text className="text-sm text-muted-foreground">{PUSH_PERMISSION_SHEET.body}</Text>
				{/* not now, then turn on */}
				<View className="flex-row flex-wrap justify-end gap-2">
					<Button
						variant="ghost"
						accessibilityLabel={PUSH_PERMISSION_SHEET.declineLabel}
						onPress={() => onChoose(false)}
					>
						<Text>{PUSH_PERMISSION_SHEET.declineLabel}</Text>
					</Button>
					<Button accessibilityLabel={PUSH_PERMISSION_SHEET.acceptLabel} onPress={() => onChoose(true)}>
						<Text>{PUSH_PERMISSION_SHEET.acceptLabel}</Text>
					</Button>
				</View>
			</View>
		</Sheet>
	)
}
