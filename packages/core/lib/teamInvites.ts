import { sendUserInvite } from "@carlnotes/client/topicClient"
import type { PendingInvite } from "./teamFields"

/**
 * Names an invitation consistently in the editor and its delivery feedback.
 */
export function toInviteLabel(invite: PendingInvite): string {
	return "email" in invite ? invite.email : `@${invite.username}`
}

/**
 * Sends staged team invitations, retaining failed entries for a deliberate retry.
 */
export async function sendTeamInvites({
	teamId,
	invites,
	onSent,
}: {
	teamId: string
	invites: PendingInvite[]
	onSent: (invite: PendingInvite) => void
}): Promise<string | null> {
	for (const invite of invites) {
		const rejection = await sendUserInvite({ teamId }, invite)
		if (rejection === "limited") {
			return "Daily invite limit reached. It resets tomorrow."
		}
		if (rejection) {
			return `The invitation to ${toInviteLabel(invite)} didn't go through.`
		}
		onSent(invite)
	}
	return null
}

/**
 * Sends pending invitations and removes sent entries before a failed batch can be retried.
 */
export async function sendPendingTeamInvites({
	teamId,
	invites,
	setPendingInvites,
}: {
	teamId: string
	invites: PendingInvite[]
	setPendingInvites: (update: (pending: PendingInvite[]) => PendingInvite[]) => void
}): Promise<void> {
	const rejection = await sendTeamInvites({
		teamId,
		invites,
		onSent: (sentInvite) =>
			setPendingInvites((pendingInvites) => pendingInvites.filter((invite) => invite !== sentInvite)),
	})
	if (rejection) {
		throw new Error(rejection)
	}
}
