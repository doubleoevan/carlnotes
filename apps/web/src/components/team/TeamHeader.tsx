// the team page's identity header, with a leader's avatar picker

import { sendTeamAvatar } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { TEAM_AVATAR_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "@/components/avatar/AvatarUpload"
import { TeamAvatarPicker } from "@/components/avatar/TeamAvatarPicker"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Button } from "@/components/primitives/button"
import { JoinTeamButton } from "./JoinTeamButton"

// the leader's avatar picker in the header, uploading a chosen or dropped image at once
function TeamHeaderAvatar({
	team,
	onChanged,
}: {
	team: { teamId: string; name: string; avatarVersion: string | null }
	onChanged: () => void
}) {
	const [isUploading, setIsUploading] = useState(false)

	// upload at once. success reloads the team with its new version, and a rejection shows a toast
	const handleAvatarChange = async (avatarFile: File): Promise<void> => {
		setIsUploading(true)
		const rejection = await sendTeamAvatar(team.teamId, avatarFile).finally(() => setIsUploading(false))
		if (rejection) {
			toast.error(toAvatarRejectionText(rejection, TEAM_AVATAR_UPLOAD_FAILED_TEXT))
			return
		}
		onChanged()
	}

	return (
		<TeamAvatarPicker
			team={team}
			onAvatarChange={(avatarFile) => void handleAvatarChange(avatarFile)}
			isDisabled={isUploading}
			className="size-16"
		/>
	)
}

/**
 * The team page's identity header: the avatar, the name, the counts, and a non-member's join control.
 */
export function TeamHeader({
	teamPage,
	isSignedIn,
	onChanged,
	onInviteOpen,
	onOpenChat,
}: {
	teamPage: TeamPageResponse
	isSignedIn: boolean
	onChanged: () => void
	onInviteOpen: () => void
	// the chat mention badge's click opens the page's chat room panel
	onOpenChat: () => void
}) {
	const isTeamLeader = isLeaderRole(teamPage.role)
	// a role of any kind is a membership
	const isTeamMember = Boolean(teamPage.role)
	return (
		<header>
			<div className="flex items-center gap-4">
				{isTeamLeader ? (
					<TeamHeaderAvatar team={teamPage} onChanged={onChanged} />
				) : (
					<TeamAvatar team={teamPage} className="size-16" />
				)}
				<span className="relative inline-block">
					<h1 className="font-display text-2xl">{teamPage.name}</h1>
					{/* the team chat room's unseen mentions. the badge's click opens the chat room, which clears it */}
					<PageUpdateCountBadge
						topicId={null}
						teamId={teamPage.teamId}
						href={`/teams/${teamPage.teamId}`}
						onClick={(event) => {
							// the click opens the chat room in place instead of re-navigating to the page
							event.preventDefault()
							onOpenChat()
						}}
					/>
				</span>
				{/* the right column, the join or add button aligned with the avatar's top */}
				<div className="ml-auto flex flex-col items-end gap-1 self-start">
					{!isTeamMember && (
						<JoinTeamButton
							teamId={teamPage.teamId}
							teamName={teamPage.name}
							hasJoinRequest={teamPage.hasRequestedToJoin}
							isSignedIn={isSignedIn}
							onChangeRequest={onChanged}
						/>
					)}
					{isTeamMember && (
						<Button className="shrink-0" onClick={onInviteOpen}>
							<Plus className="size-4" />
							Add Member
						</Button>
					)}
				</div>
			</div>
			<p className="text-muted-foreground mt-2 text-sm">
				{/* activated members alone, so a waiting request never inflates the headline */}
				{toCountLabel(
					teamPage.members.filter((member) => member.isActive).length + teamPage.hiddenMemberCount,
					"member",
				)}{" "}
				· {toCountLabel(teamPage.topics.length, "topic")}
			</p>
			{teamPage.description && <p className="mt-2 text-sm">{teamPage.description}</p>}
		</header>
	)
}
