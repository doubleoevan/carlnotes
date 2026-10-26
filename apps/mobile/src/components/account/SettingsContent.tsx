import { authClient } from "@carlnotes/client/authClient"
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { useAvatar } from "@carlnotes/core/hooks/useAvatar"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { CLOSE_ACCOUNT_CONFIRMATION, CLOSE_ACCOUNT_SECTION_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { TOPIC_TUTORIAL_WATCH_LABEL } from "@carlnotes/core/lib/topicTutorialVideo"
import type { ComponentRef } from "react"
import { type ReactNode, useRef, useState } from "react"
import { Text as NativeText, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { SessionErrorText } from "@/components/session/SessionErrorText"
import { TopicTutorialVideoDialog } from "@/components/topic/TopicTutorialVideoDialog"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// account requests stay with the route, while stories can show every pending and error state
export type SettingsContentProps = {
	identity: ReactNode
	closeError: string | null
	isPending: boolean
	onSignOut: () => void
	onCloseAccount: () => void
}

/**
 * Shows account identity, the tutorial, and the existing account exit controls.
 */
export function SettingsContent({ identity, closeError, isPending, onSignOut, onCloseAccount }: SettingsContentProps) {
	// keep a separate tutorial lifetime for each Settings opening
	const [isTutorialOpen, setIsTutorialOpen] = useState(false)
	const tutorialTriggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<View className="gap-4 p-4">
			<NativeText style={toTypeRoleStyle("pageTitle")} accessibilityRole="header" className="text-foreground">
				Account
			</NativeText>
			{identity}
			{/* preserve access to the web's account controls until they have native implementations */}
			<Button variant="outline" asChild accessibilityLabel="Manage account on web">
				<AnchorLink href={`${SITE_URL}/account`} accessibilityLabel="Manage account on web">
					<Text>Manage account on web</Text>
				</AnchorLink>
			</Button>
			<Button
				ref={tutorialTriggerRef}
				variant="outline"
				accessibilityLabel={TOPIC_TUTORIAL_WATCH_LABEL}
				onPress={() => setIsTutorialOpen(true)}
			>
				<Text>{TOPIC_TUTORIAL_WATCH_LABEL}</Text>
			</Button>
			<Button accessibilityLabel="Sign out" disabled={isPending} onPress={onSignOut}>
				<Text>Sign out</Text>
			</Button>
			<Button variant="link" asChild accessibilityLabel="Privacy policy">
				<AnchorLink href={`${SITE_URL}/privacy`} accessibilityLabel="Privacy policy">
					<Text>Privacy policy</Text>
				</AnchorLink>
			</Button>
			{/* account closure keeps the web's wording and destructive placement */}
			<View className="mt-8 gap-3 rounded-lg border border-destructive p-4">
				<NativeText style={toTypeRoleStyle("sectionHeading")} className="text-destructive">
					Close your account
				</NativeText>
				<NativeText style={toTypeRoleStyle("body")} className="text-muted-foreground">
					{CLOSE_ACCOUNT_SECTION_TEXT}
				</NativeText>
				<SessionErrorText text={closeError} />
				<Button
					variant="destructive"
					accessibilityLabel={CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}
					disabled={isPending}
					onPress={onCloseAccount}
				>
					<Text>{CLOSE_ACCOUNT_CONFIRMATION.confirmLabel}</Text>
				</Button>
			</View>
			{isTutorialOpen ? (
				<TopicTutorialVideoDialog
					opener="mobile-settings"
					triggerRef={tutorialTriggerRef}
					onClose={() => setIsTutorialOpen(false)}
				/>
			) : null}
		</View>
	)
}

/**
 * Shows the signed-in user's name and delivered avatar in Settings.
 */
export function SignedInUserRow() {
	// read the session and avatar version from their shared owners
	const { data: session } = authClient().useSession()
	const { avatarVersion } = useAvatar()
	if (!session) {
		return null
	}

	// fall back to the same initials and tint as the web
	const { id: userId, name, username } = session.user
	const avatarImageUrl = avatarVersion === null ? null : toAvatarImagePath(userId, avatarVersion)
	return (
		<View className="flex-row items-center gap-3">
			<Avatar imageUrl={avatarImageUrl} ownerId={userId} name={username} size={44} />
			<View className="flex-1">
				<NativeText style={toTypeRoleStyle("label")} className="text-foreground">
					{name || username}
				</NativeText>
				<NativeText style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					@{username}
				</NativeText>
			</View>
		</View>
	)
}
