import { sendCreateTeamInvite } from "@carlnotes/client/teamClient"
import { toTeamPath } from "@carlnotes/contracts/seo"
import { Check, Share } from "lucide-react"
import { toast } from "sonner"
import { useOrigin } from "@/hooks/useBrowserValue"
import { toInviteUrl } from "@/lib/inviteUrl"
import { openShareSheet } from "@/lib/shareSheet"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { PageShareDialog } from "./PageShareDialog"
import { INVITE_LABEL, INVITE_SHARE_LABEL, SHARE_OPTION_CLASS, SHARE_OPTION_ICON_CLASS } from "./ShareOptions"
import { usePageShare } from "./usePageShare"

/**
 * The Share dialog for a Team, opened from the actions menu. It shares the team's page,
 * which can only be opened by a non-member if the team is public. A private team's options are disabled with a call to action.
 * A team member also gets the invite option, which provides a link that joins the team.
 */
export function ShareTeam({
	teamId,
	teamName,
	isPublic,
	canInvite,
	onClose,
}: {
	teamId: string
	teamName: string
	isPublic: boolean
	// a team member may provide a link that joins the team, which a non-member may not
	canInvite: boolean
	onClose: () => void
}) {
	// the team page's absolute url, which a platform needs
	const teamUrl = `${useOrigin()}${toTeamPath(teamId)}`

	// report a share by its channel. a team is never named
	const handleShareOptionClick = (channel: string): void =>
		captureVisitEvent("visit_share_clicked", { kind: "team", channel })

	// the copy and the share sheet for the team's page
	const pageShare = usePageShare({ title: teamName, url: teamUrl, onShareOptionClick: handleShareOptionClick })
	const { copiedLabel, isShareSheetAvailable, copyLink: handleCopyLink } = pageShare

	// create the invite token inside the click handler and pass its invite url to the share sheet
	async function handleShareInvite(): Promise<void> {
		handleShareOptionClick("invite")
		let invite: Awaited<ReturnType<typeof sendCreateTeamInvite>>
		try {
			invite = await sendCreateTeamInvite(teamId, "share-sheet")
		} catch (error) {
			console.error("invite create failed", error)
			toast.error("That invite didn't get made. Try again.")
			return
		}
		if (invite === "limited") {
			toast.error("Daily invite limit reached. It resets tomorrow.")
			return
		}

		// show share sheet if available otherwise show the copy link
		const inviteUrl = toInviteUrl(invite.token)
		const shareSheetResult = isShareSheetAvailable
			? await openShareSheet({ title: teamName, text: `Join ${teamName} on CarlNotes`, url: inviteUrl })
			: "unavailable"
		if (shareSheetResult === "unavailable") {
			await handleCopyLink(INVITE_LABEL, inviteUrl)
		}
	}

	// the invite option opens a sheet where there is one, and copies everywhere else
	const inviteLabel = isShareSheetAvailable ? INVITE_SHARE_LABEL : INVITE_LABEL
	return (
		<PageShareDialog
			heading="Share team"
			disabledReason={isPublic ? null : "Make this team public to post it to a platform"}
			pageShare={pageShare}
			onClose={onClose}
		>
			{/* the only option that grants access. every other option shares the team's page */}
			{canInvite && (
				<button type="button" onClick={() => void handleShareInvite()} className={SHARE_OPTION_CLASS}>
					{copiedLabel === INVITE_LABEL ? (
						<Check className={SHARE_OPTION_ICON_CLASS} />
					) : (
						<Share className={SHARE_OPTION_ICON_CLASS} />
					)}
					{copiedLabel === INVITE_LABEL ? "Link copied" : inviteLabel}
				</button>
			)}
		</PageShareDialog>
	)
}
