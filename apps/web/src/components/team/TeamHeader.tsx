// the team page's identity header, with a leader's avatar picker

import { sendTeamAvatar } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { toTeamPath } from "@carlnotes/contracts/seo"
import { type TeamPageResponse, toTeamPageTitle } from "@carlnotes/contracts/teams"
import { ADD_TEAM_MEMBER_LABEL, toTeamDetails } from "@carlnotes/core/lib/teamFields"
import { cn } from "@carlnotes/nightshift/classNames"
import { Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { TEAM_AVATAR_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "@/components/avatar/AvatarUpload"
import { TeamAvatarPicker } from "@/components/avatar/TeamAvatarPicker"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import {
	PAGE_AVATAR_CLASS,
	PAGE_HEADER_AVATAR_FLOAT_CLASS,
	PAGE_HEADER_DESCRIPTION_CLASS,
	PAGE_HEADER_DETAILS_CLASS,
	PAGE_HEADER_FLOW_CLASS,
	PAGE_HEADER_TITLE_CLASS,
} from "@/lib/pageHeaderClasses"
import { PAGE_BUTTON_ROW_CLASS, PLAIN_PAGE_BUTTON_CLASS, PLAIN_PAGE_BUTTON_ICON_CLASS } from "@/lib/styleClasses"
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
			className={PAGE_AVATAR_CLASS}
		/>
	)
}

/**
 * The team page's header: the row of the page's buttons, adding a member or joining at the left and the topic button
 * at the right, then the avatar with the title, the counts, and the description beside it.
 */
export function TeamHeader({
	teamPage,
	noteCount,
	isSignedIn,
	onChanged,
	onInviteOpen,
	onOpenChat,
	topicButton,
}: {
	teamPage: TeamPageResponse
	// how many notes the page's notes section lists, null until the notes load
	noteCount: number | null
	isSignedIn: boolean
	onChanged: () => void
	onInviteOpen: () => void
	// the chat mention badge's click opens the page's chat room panel
	onOpenChat: () => void
	// the button at the row's right: a leader's Add Topic, or New Topic for everyone else
	topicButton: ReactNode
}) {
	const isTeamLeader = isLeaderRole(teamPage.role)
	// a role of any kind is a membership
	const isTeamMember = Boolean(teamPage.role)
	return (
		<header>
			{/* the page's buttons under the search bar: a member adds a member and anyone else joins at the left, in the
			    plain style with its icon alone in the highlight color, and the topic button at the right is the row's one
			    highlighted button */}
			<div className={PAGE_BUTTON_ROW_CLASS}>
				{isTeamMember ? (
					<button type="button" className={PLAIN_PAGE_BUTTON_CLASS} onClick={onInviteOpen}>
						<Plus className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						{ADD_TEAM_MEMBER_LABEL}
					</button>
				) : (
					<JoinTeamButton
						teamId={teamPage.teamId}
						teamName={teamPage.name}
						hasJoinRequest={teamPage.hasRequestedToJoin}
						isSignedIn={isSignedIn}
						isHighlighted={false}
						onChangeRequest={onChanged}
					/>
				)}
				{topicButton}
			</div>
			<div className={PAGE_HEADER_FLOW_CLASS}>
				<div className={PAGE_HEADER_AVATAR_FLOAT_CLASS}>
					{isTeamLeader ? (
						<TeamHeaderAvatar team={teamPage} onChanged={onChanged} />
					) : (
						<TeamAvatar team={teamPage} className={PAGE_AVATAR_CLASS} />
					)}
				</div>
				{/* the page's title, with the team chat room's unseen mentions. the badge's click opens the chat room */}
				<span className={cn(PAGE_HEADER_TITLE_CLASS, "relative")}>
					<h1 className="font-display text-2xl">{toTeamPageTitle(teamPage.name)}</h1>
					<PageUpdateCountBadge
						topicId={null}
						teamId={teamPage.teamId}
						href={toTeamPath(teamPage.teamId)}
						onClick={(event) => {
							// the click opens the chat room in place instead of re-navigating to the page
							event.preventDefault()
							onOpenChat()
						}}
					/>
				</span>
				<DetailsLine className={PAGE_HEADER_DETAILS_CLASS} details={toTeamDetails({ teamPage, noteCount })} />
				{teamPage.description && <p className={cn(PAGE_HEADER_DESCRIPTION_CLASS, "text-sm")}>{teamPage.description}</p>}
			</div>
		</header>
	)
}
