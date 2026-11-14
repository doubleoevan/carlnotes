import { sendTeamAvatarBody } from "@carlnotes/client/teamClient"
import { toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { TeamHeader as SharedTeamHeader, type TeamHeaderElements } from "@carlnotes/core/components/TeamHeader"
import { IMAGE_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "@carlnotes/core/lib/imageUpload"
import { View } from "react-native"
import { useAvatarPicker } from "@/components/avatar/avatarUpload"
import { UncheckedAvatarLine } from "@/components/avatar/UncheckedAvatarLine"
import { Avatar, PAGE_AVATAR_SIZE } from "@/components/branding/Avatar"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PageHeaderIdentity } from "@/components/common/PageHeaderIdentity"
import { PageHeaderRow } from "@/components/common/PageHeaderRow"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Renders the web's team header: the avatar, which a leader presses to pick a new one, beside the title, its mention
 * badge, and the counts, then the description. An unchecked upload shows to the leader who uploaded it in the
 * team's avatar's place, with its line under it.
 */
export function TeamHeader({
	teamPage,
	noteCount,
	onReload,
}: {
	teamPage: TeamPageResponse
	noteCount: number | null
	onReload: () => void
}) {
	const { teamId } = teamPage
	const mutation = usePageMutation(onReload)
	// a leader's avatar press opens the picker menu, and the picked image uploads at once
	const teamAvatarPicker = useAvatarPicker({
		onPicked: (body) =>
			mutation.run(async () => {
				const rejection = await sendTeamAvatarBody(teamId, body)
				if (rejection) {
					throw new Error(toAvatarRejectionText(rejection, IMAGE_UPLOAD_FAILED_TEXT))
				}
			}),
	})

	// the team's avatar at the page size, which a leader's press changes. the leader who uploaded an unchecked avatar
	// sees that upload in its place, loaded with their session
	const shownAvatarVersion = teamPage.uncheckedAvatarVersion ?? teamPage.avatarVersion
	const avatar = (
		<Avatar
			ownerId={teamId}
			name={teamPage.name}
			imageUrl={shownAvatarVersion ? toTeamAvatarImagePath(teamId, shownAvatarVersion) : null}
			isUnchecked={Boolean(teamPage.uncheckedAvatarVersion)}
			size={PAGE_AVATAR_SIZE}
		/>
	)
	return (
		<View className="gap-2">
			<SharedTeamHeader
				teamPage={teamPage}
				noteCount={noteCount}
				avatar={
					isLeaderRole(teamPage.role) ? (
						<View className="items-start">
							<Button
								ref={teamAvatarPicker.triggerRef}
								variant="ghost"
								accessibilityLabel="Change team avatar"
								className="h-auto p-0"
								disabled={mutation.isPending || teamAvatarPicker.isPicking}
								onPress={teamAvatarPicker.openFilePicker}
							>
								{avatar}
							</Button>
							{teamAvatarPicker.filePickerMenu}
							{/* the upload only this leader sees until its check passes */}
							{teamPage.uncheckedAvatarVersion ? <UncheckedAvatarLine avatarSize={PAGE_AVATAR_SIZE} /> : null}
						</View>
					) : (
						avatar
					)
				}
				// the team chat room's unseen mentions and the team's note changes. the press opens the chat room
				mentionBadge={<PageUpdateCountBadge topicId={null} teamId={teamId} />}
				elements={TEAM_HEADER_ELEMENTS}
			/>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}

// the native avatar row, whose column drops below the avatar at a large text size, and the description under it
const TEAM_HEADER_ELEMENTS: TeamHeaderElements = {
	Frame: ({ children }) => <View className="gap-2">{children}</View>,
	AvatarRow: PageHeaderRow,
	AvatarSlot: ({ children }) => <>{children}</>,
	Identity: PageHeaderIdentity,
	TitleRow: ({ children }) => <View className="flex-row items-center gap-2">{children}</View>,
	Title: ({ children }) => (
		<Text accessibilityRole="header" className="shrink font-display text-2xl">
			{children}
		</Text>
	),
	Details: DetailsLine,
	Description: ({ children }) => <Text className="text-sm">{children}</Text>,
}
