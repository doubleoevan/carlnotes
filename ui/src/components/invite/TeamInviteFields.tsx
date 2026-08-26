import { toast } from "sonner"
import { sendCreateTeamInvite } from "@/clients/teamClient"
import { sendUserInvite } from "@/clients/topicClient"
import { InviteFields } from "@/components/invite/InviteFields"

// a pending invitation staged in the members fields, sent when the caller submits
export type PendingInvite = { email: string } | { username: string }

// send the invitations staged in the form, each reported by a toast
export async function sendPendingInvites(teamId: string, pendingInvites: PendingInvite[]): Promise<void> {
	for (const invite of pendingInvites) {
		const label = "email" in invite ? invite.email : `@${invite.username}`
		const refusal = await sendUserInvite({ teamId }, invite)
		if (refusal) {
			toast.error(`The invitation to ${label} didn't go through.`)
		} else {
			toast(`Invited ${label}.`)
		}
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
	const toLabel = (invite: PendingInvite): string => ("email" in invite ? invite.email : `@${invite.username}`)
	return (
		<InviteFields
			label="Members"
			invites={pendingInvites.map(toLabel)}
			onRemoveInvite={(chip) => onPendingInvitesChange(pendingInvites.filter((kept) => toLabel(kept) !== chip))}
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
									return (await sendCreateTeamInvite(linkedTeamId, source)).token
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
