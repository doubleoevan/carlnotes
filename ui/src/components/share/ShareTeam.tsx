import { Check, Link, Share } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendCreateTeamInvite } from "@/clients/teamClient"
import { toInviteUrl } from "@/clients/topicClient"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import {
	COPIED_FEEDBACK_MS,
	COPY_PAGE_LABEL,
	CopyLinkOption,
	DisabledShareOption,
	INVITE_LABEL,
	INVITE_SHARE_LABEL,
	POST_PLATFORM_TARGETS,
	SEND_TARGETS,
	SHARE_OPTION_CLASS,
	SHARE_OPTION_ICON_CLASS,
	ShareTargetOptions,
} from "@/components/share/ShareOptions"
import { canOpenShareSheet, openShareSheet } from "@/lib/shareSheet"
import { copyWithDocument } from "@/lib/utils"

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
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
	// read once on mount, so the share sheet is only shown if available
	const [isShareSheetAvailable] = useState(canOpenShareSheet)

	// the absolute url a platform needs, encoded once for use inside a query string
	const teamUrl = `${window.location.origin}/teams/${teamId}`
	const [encodedUrl, encodedTitle] = [encodeURIComponent(teamUrl), encodeURIComponent(teamName)]

	// copy a link to the team to the clipboard and show a confirmation label
	async function handleCopyLink(label: string, text: string): Promise<void> {
		let isCopied = true
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			isCopied = copyWithDocument(text)
		}
		if (isCopied) {
			setCopiedLabel(label)
			setTimeout(() => setCopiedLabel(null), COPIED_FEEDBACK_MS)
		}
	}

	// pass the team's url to the device's sheet. a rejected gesture falls back to the clipboard copy
	async function handleShareSheet(): Promise<void> {
		const shared = await openShareSheet({ title: teamName, text: `${teamName} on CarlNotes`, url: teamUrl })
		if (shared === "unavailable") {
			await handleCopyLink(COPY_PAGE_LABEL, teamUrl)
		}
	}

	// create the invite token inside the click handler and pass its invite url to the share sheet
	async function handleShareInvite(): Promise<void> {
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

	const reason = "Make this team public to post it to a platform"
	const targetOptionProps = { isEnabled: isPublic, encodedUrl, encodedTitle, reason }
	// the invite option opens a sheet where there is one, and copies everywhere else
	const inviteLabel = isShareSheetAvailable ? INVITE_SHARE_LABEL : INVITE_LABEL
	return (
		<Dialog open onOpenChange={onClose}>
			{/* the tighter padding and gap keep the dialog to the topic share popover's own density */}
			<DialogContent className="gap-2 p-4 sm:max-w-xs">
				<DialogTitle>Share team</DialogTitle>
				{/* one list, so the dialog's grid gap never falls between the options */}
				<div className="grid">
					<ShareTargetOptions shareTargets={POST_PLATFORM_TARGETS} {...targetOptionProps} />
					{/* a divider above the options that share the team to one person instead of posting it */}
					<div className="bg-border my-1 h-px" />
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
					{/* the device's share sheet is above the send options if one can open */}
					{isShareSheetAvailable &&
						(isPublic ? (
							<button type="button" onClick={() => void handleShareSheet()} className={SHARE_OPTION_CLASS}>
								<Share className={SHARE_OPTION_ICON_CLASS} />
								Share…
							</button>
						) : (
							<DisabledShareOption
								label="Share…"
								icon={<Share className={SHARE_OPTION_ICON_CLASS} />}
								disabledReason={reason}
							/>
						))}
					<ShareTargetOptions shareTargets={SEND_TARGETS} {...targetOptionProps} />
					{/* the copy link option sits under a divider */}
					<div className="bg-border my-1 h-px" />
					<CopyLinkOption
						label={COPY_PAGE_LABEL}
						icon={<Link className="size-4" />}
						className={SHARE_OPTION_CLASS}
						isCopied={copiedLabel === COPY_PAGE_LABEL}
						onCopy={() => handleCopyLink(COPY_PAGE_LABEL, teamUrl)}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
