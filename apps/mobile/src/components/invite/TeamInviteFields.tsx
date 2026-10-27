import { sendCreateTeamInvite } from "@carlnotes/client/teamClient"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import type { PendingInvite } from "@carlnotes/core/lib/teamFields"
import { toInviteLabel } from "@carlnotes/core/lib/teamInvites"
import { Link } from "lucide-react-native"
import { Share, View } from "react-native"
import { InviteFields } from "@/components/invite/InviteFields"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Stages the shared team invitation fields and shares a real invitation link.
 */
export function TeamInviteFields({
	teamId,
	teamName,
	pendingInvites,
	onPendingInvitesChange,
	onCreateTeam,
}: {
	teamId: string | null
	teamName: string
	pendingInvites: PendingInvite[]
	onPendingInvitesChange: (invites: PendingInvite[]) => void
	onCreateTeam?: () => Promise<string | null>
}) {
	// stage distinct invitations and track submission failures
	const mutation = usePageMutation()
	function handleAdd(invite: PendingInvite): void {
		if (!pendingInvites.some((pending) => toInviteLabel(pending) === toInviteLabel(invite))) {
			onPendingInvitesChange([...pendingInvites, invite])
		}
	}
	return (
		<View className="gap-2">
			<InviteFields
				label="Members"
				invites={pendingInvites.map(toInviteLabel)}
				onRemoveInvite={(label) =>
					onPendingInvitesChange(pendingInvites.filter((invite) => toInviteLabel(invite) !== label))
				}
				onAddEmail={(email) => {
					handleAdd({ email })
					return null
				}}
				onAddUsername={(username) => handleAdd({ username })}
				inviteLink={
					(teamId || onCreateTeam) && (
						<Button
							variant="outline"
							accessibilityLabel="Invite by link"
							disabled={mutation.isPending}
							onPress={() =>
								void mutation.run(async () => {
									// create the invitation target before requesting a share link
									const linkedTeamId = teamId ?? (await onCreateTeam?.())
									if (!linkedTeamId) {
										return
									}

									// request the invitation token and show the system share sheet
									const invitation = await sendCreateTeamInvite(linkedTeamId, "share-sheet")
									if (invitation === "limited") {
										throw new Error("Daily invite limit reached. It resets tomorrow.")
									}
									await Share.share({
										title: `Join ${teamName} on CarlNotes`,
										message: `Carl reads this team's topics and takes notes. Join here: ${SITE_URL}${toInvitePath(invitation.token)}`,
									})
								})
							}
						>
							<Icon as={Link} className="size-4" />
							<Text>Invite by link</Text>
						</Button>
					)
				}
			/>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}
