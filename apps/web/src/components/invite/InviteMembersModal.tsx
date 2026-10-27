import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { type PendingInvite, sendPendingInvites, TeamInviteFields } from "./TeamInviteFields"

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
	const [isSending, setIsSending] = useState(false)
	const [rejection, setRejection] = useState<string | null>(null)

	// send the staged invites, each reported by its own toast, then close the modal
	const handleSendInvites = async (): Promise<void> => {
		setIsSending(true)
		setRejection(null)
		try {
			await sendPendingInvites(teamId, pendingInvites, (acceptedInvite) =>
				setPendingInvites((invites) => invites.filter((invite) => invite !== acceptedInvite)),
			)
			onClose()
		} catch (error) {
			setRejection(error instanceof Error ? error.message : "Those invites didn't send. Try again.")
		} finally {
			setIsSending(false)
		}
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
					{rejection && (
						<p role="alert" className="text-sm text-destructive">
							{rejection}
						</p>
					)}
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={() => void handleSendInvites()} disabled={isSending || pendingInvites.length === 0}>
						Send invites
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
