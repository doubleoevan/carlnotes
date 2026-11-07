// the account's Notifications section: the daily notifications email's switch, and on a phone one switch for each kind
// of push over the session's saved preferences, with the phone's permission states around them
import { authClient } from "@carlnotes/client/authClient"
import { sendNotificationsEmailPreference } from "@carlnotes/client/profileClient"
import { sendPushPreference } from "@carlnotes/client/pushClient"
import type { PushNotificationKind } from "@carlnotes/contracts/pushDevices"
import { useState } from "react"
import {
	CHAT_MENTION_PUSH_LABEL,
	NOTIFICATIONS_EMAIL_LABEL,
	NOTIFICATIONS_SECTION_TEXT,
	NOTIFICATIONS_SECTION_TITLE,
	OPEN_SETTINGS_LABEL,
	PUSH_DENIED_TEXT,
	PUSH_PERMISSION_SHEET,
	PUSH_UNDETERMINED_TEXT,
	TOPIC_PUSH_LABEL,
} from "../lib/pushCopy"
import { SAVE_FAILED_TEXT } from "../lib/sessionCopy"
import type { AccountFieldElements } from "./AccountFields"

// whether the phone lets the app notify: allowed, denied in the system settings, or never asked
export type PushPermission = "granted" | "denied" | "undetermined"

// the account's saved push preferences, null until the user first grants permission
export type PushPreferences = { isTopicPushEnabled: boolean | null; isChatMentionPushEnabled: boolean | null }

// one switch's state, and both switches by kind
type NotificationSwitchState = { isChecked: boolean; isDisabled: boolean }
export type NotificationSwitchStates = Record<PushNotificationKind, NotificationSwitchState>

/**
 * Returns each switch's state: on only once the user turned it on and the phone allows notifications, and usable only
 * while the phone allows them and no save is running. A failed save leaves the saved value, so the switch returns to it.
 */
export function toNotificationSwitchStates({
	pushPermission,
	pushPreferences,
	savingKind,
}: {
	pushPermission: PushPermission
	pushPreferences: PushPreferences
	savingKind: PushNotificationKind | null
}): NotificationSwitchStates {
	const isGranted = pushPermission === "granted"
	const isDisabled = !isGranted || savingKind !== null
	return {
		"topic-scan": { isChecked: isGranted && pushPreferences.isTopicPushEnabled === true, isDisabled },
		"chat-mention": { isChecked: isGranted && pushPreferences.isChatMentionPushEnabled === true, isDisabled },
	}
}

// what the Notifications card shows and what its controls do. the web has no push, so it passes no push state
export type NotificationsCardProps = {
	elements: AccountFieldElements
	notificationsEmailSwitchState: NotificationSwitchState
	onNotificationsEmailChange: (isEnabled: boolean) => void
	error: string | null
	push?: {
		pushPermission: PushPermission
		switchStates: NotificationSwitchStates
		onChange: (kind: PushNotificationKind, isEnabled: boolean) => void
		onRequestPermission: () => void
		onOpenSettings: () => void
	}
}

/**
 * Shows the account's Notifications card: on a phone one switch for each kind of push, a button that asks before the
 * phone was ever asked, and a link to the system settings after a denial, then the daily notifications email's switch.
 */
export function NotificationsCard({
	elements,
	notificationsEmailSwitchState,
	onNotificationsEmailChange,
	error,
	push,
}: NotificationsCardProps) {
	const { Card, Heading, Text, Switch, Button } = elements
	return (
		<Card>
			<Heading>{NOTIFICATIONS_SECTION_TITLE}</Heading>
			{push && (
				<>
					<Text className="text-muted-foreground mt-1 text-sm">{NOTIFICATIONS_SECTION_TEXT}</Text>
					<Switch
						label={TOPIC_PUSH_LABEL}
						{...push.switchStates["topic-scan"]}
						onChange={(isEnabled) => push.onChange("topic-scan", isEnabled)}
					/>
					<Switch
						label={CHAT_MENTION_PUSH_LABEL}
						{...push.switchStates["chat-mention"]}
						onChange={(isEnabled) => push.onChange("chat-mention", isEnabled)}
					/>
				</>
			)}
			{/* the permission prompt before the first ask, and the system settings after a denial */}
			{push?.pushPermission === "undetermined" && (
				<>
					<Text className="text-muted-foreground mt-2 text-sm">{PUSH_UNDETERMINED_TEXT}</Text>
					<Button label={PUSH_PERMISSION_SHEET.acceptLabel} onPress={push.onRequestPermission} />
				</>
			)}
			{push?.pushPermission === "denied" && (
				<>
					<Text className="text-muted-foreground mt-2 text-sm">{PUSH_DENIED_TEXT}</Text>
					<Button label={OPEN_SETTINGS_LABEL} onPress={push.onOpenSettings} />
				</>
			)}
			{/* the daily email of reactions, comments, and mentions, whatever the phone allows */}
			<Switch
				label={NOTIFICATIONS_EMAIL_LABEL}
				{...notificationsEmailSwitchState}
				onChange={onNotificationsEmailChange}
			/>
			{error && <Text className="text-destructive mt-2 text-sm">{error}</Text>}
		</Card>
	)
}

// what the section reads from the phone, which the web leaves out
type NotificationsSectionProps = {
	elements: AccountFieldElements
	pushPermission?: PushPermission
	onRequestPermission?: () => void
	onOpenSettings?: () => void
}

/**
 * Composes the account's Notifications card over the session's saved preferences, saving one switch at a time.
 */
export function NotificationsSection({
	elements,
	pushPermission,
	onRequestPermission = () => {},
	onOpenSettings = () => {},
}: NotificationsSectionProps) {
	// the saved switches from the shared session, and the switch being saved
	const { data: session, refetch } = authClient().useSession()
	const [savingKind, setSavingKind] = useState<PushNotificationKind | "email" | null>(null)
	const [error, setError] = useState<string | null>(null)
	async function handleChange(kind: PushNotificationKind | "email", isEnabled: boolean): Promise<void> {
		// one save at a time, and a failed save leaves the switch at its saved value
		if (savingKind) {
			return
		}
		setSavingKind(kind)
		setError(null)
		try {
			await (kind === "email" ? sendNotificationsEmailPreference(isEnabled) : sendPushPreference(kind, isEnabled))
			await refetch()
		} catch {
			setError(SAVE_FAILED_TEXT)
		} finally {
			setSavingKind(null)
		}
	}
	if (!session) {
		return null
	}

	// the switches from the session's saved preferences. the email is off until the user turns it on
	const pushPreferences = {
		isTopicPushEnabled: session.user.isTopicPushEnabled ?? null,
		isChatMentionPushEnabled: session.user.isChatMentionPushEnabled ?? null,
	}
	const pushSavingKind = savingKind === "email" ? null : savingKind
	return (
		<NotificationsCard
			elements={elements}
			notificationsEmailSwitchState={{
				isChecked: session.user.isNotificationsEmailEnabled === true,
				isDisabled: savingKind !== null,
			}}
			onNotificationsEmailChange={(isEnabled) => void handleChange("email", isEnabled)}
			error={error}
			push={
				pushPermission && {
					pushPermission,
					switchStates: toNotificationSwitchStates({ pushPermission, pushPreferences, savingKind: pushSavingKind }),
					onChange: (kind, isEnabled) => void handleChange(kind, isEnabled),
					onRequestPermission,
					onOpenSettings,
				}
			}
		/>
	)
}
