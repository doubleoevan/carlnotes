import { useState } from "react"
import { type PendingInvite, sendPendingInvites, TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"

/**
 * The invite dialog a team member opens from the team page: the same email, username, and link fields the team form has.
 * Invites stage as chips, and the Send invites button is what sends them.
 * The link menu works on its own, so the dialog can be closed right after copying one.
 */
export function InviteMembersModal({
	teamId,
	teamName,
	onClose,
}: {
	teamId: string
	teamName: string
	onClose: () => void
}) {
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])

	// send the staged invites, each reported by its own toast, then close the modal
	const handleSendInvites = async (): Promise<void> => {
		await sendPendingInvites(teamId, pendingInvites)
		onClose()
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>Invite members</DialogTitle>
				<TeamInviteFields
					teamId={teamId}
					teamName={teamName}
					pendingInvites={pendingInvites}
					onPendingInvitesChange={setPendingInvites}
				/>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={() => void handleSendInvites()} disabled={pendingInvites.length === 0}>
						Send invites
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
