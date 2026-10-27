import type { PendingInvite } from "@carlnotes/core/lib/teamFields"
import { sendTeamInvites } from "@carlnotes/core/lib/teamInvites"
import { useState } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Sends the same staged membership invitations as the shared team editor.
 */
export function InviteMembersModal({
	teamId,
	teamName,
	onClose,
	onChanged,
}: {
	teamId: string
	teamName: string
	onClose: () => void
	onChanged: () => void
}) {
	const [invites, setInvites] = useState<PendingInvite[]>([])
	const mutation = usePageMutation(onChanged)
	return (
		<Sheet title="Invite members" onClose={onClose}>
			<View className="gap-4">
				<TeamInviteFields
					teamId={teamId}
					teamName={teamName}
					pendingInvites={invites}
					onPendingInvitesChange={setInvites}
				/>
				{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
				<View className="flex-row justify-end gap-2">
					<Button variant="outline" accessibilityLabel="Cancel" onPress={onClose}>
						<Text>Cancel</Text>
					</Button>
					<Button
						accessibilityLabel="Send invites"
						disabled={mutation.isPending || !invites.length}
						onPress={() =>
							void mutation.run(async () => {
								const rejection = await sendTeamInvites({
									teamId,
									invites,
									onSent: (invite) => setInvites((pending) => pending.filter((item) => item !== invite)),
								})
								if (rejection) {
									throw new Error(rejection)
								}
								onClose()
							})
						}
					>
						<Text>{mutation.isPending ? "Sending…" : "Send invites"}</Text>
					</Button>
				</View>
			</View>
		</Sheet>
	)
}
