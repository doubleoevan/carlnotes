import { sendCreateTeamInvite } from "@carlnotes/client/teamClient"
import type { PendingInvite } from "@carlnotes/core/lib/teamFields"
import { sendTeamInvites, toInviteLabel } from "@carlnotes/core/lib/teamInvites"
import { toast } from "sonner"
import { InviteFields } from "./InviteFields"

// a pending invitation staged in the members fields, sent when the caller submits
export type { PendingInvite } from "@carlnotes/core/lib/teamFields"

// send the invitations staged in the form, each reported by a toast
export async function sendPendingInvites(
	teamId: string,
	pendingInvites: PendingInvite[],
	onSent?: (invite: PendingInvite) => void,
): Promise<void> {
	const rejection = await sendTeamInvites({
		teamId,
		invites: pendingInvites,
		onSent: (invite) => {
			onSent?.(invite)
			toast(`Invited ${toInviteLabel(invite)}.`)
		},
	})
	if (rejection) {
		throw new Error(rejection)
	}
}

/**
 * The Members fields every team form shares: staged invitations as chips the save sends,
 * and the invite-by-link menu once the team exists to link to.
 */
export function TeamInviteFields({
	teamId,
	onCreateTeam,
	teamName,
	pendingInvites,
	onPendingInvitesChange,
}: {
	// the team the link addresses, or null before it exists, which the link button makes on the spot
	teamId: string | null
	// makes the team so an unsaved team still has something for a token to point at
	onCreateTeam?: () => Promise<string | null>
	teamName: string
	pendingInvites: PendingInvite[]
	onPendingInvitesChange: (invites: PendingInvite[]) => void
}) {
	// chips for each staged invitation, told apart by the @ in front of the username
	return (
		<InviteFields
			label="Members"
			invites={pendingInvites.map(toInviteLabel)}
			onRemoveInvite={(chip) => onPendingInvitesChange(pendingInvites.filter((kept) => toInviteLabel(kept) !== chip))}
			onAddEmail={(email) => {
				onPendingInvitesChange([...pendingInvites, { email }])
				return null
			}}
			onAddUsername={(username) => onPendingInvitesChange([...pendingInvites, { username }])}
			inviteLink={
				teamId || onCreateTeam
					? {
							subjectName: teamName,
							toBody: (inviteUrl) => `Carl reads this team's topics and takes notes. Join here: ${inviteUrl}`,
							// a token needs a team, so an unsaved one is created before the link is made
							createToken: async (source) => {
								const linkedTeamId = teamId ?? (await onCreateTeam?.()) ?? null
								if (!linkedTeamId) {
									return null
								}
								// the menu closes its own composer tab on a null, so a failed create answers instead of throwing
								try {
									const teamInvite = await sendCreateTeamInvite(linkedTeamId, source)
									if (teamInvite === "limited") {
										toast.error("Daily invite limit reached. It resets tomorrow.")
										return null
									}
									return teamInvite.token
								} catch (error) {
									console.error("invite create failed", error)
									toast.error("That invite link didn't get made. Try again.")
									return null
								}
							},
							link: { label: "Teams page", href: "/teams" },
							caption: "A fresh brew will be waiting to pour on their ",
							onCopied: () => toast.success("Invite link copied. Anyone holding it can join."),
						}
					: undefined
			}
		/>
	)
}
