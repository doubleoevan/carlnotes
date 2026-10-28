import { authClient } from "@carlnotes/client/authClient"
import { fetchProfileTeamStatuses } from "@carlnotes/client/profileClient"
import { sendDeleteTeamInvite, sendRemoveTeamMember } from "@carlnotes/client/teamClient"
import { sendUserInvite } from "@carlnotes/client/topicClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import { useQuery } from "@tanstack/react-query"
import { router } from "expo-router"
import { Plus, Users, X } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { EditTeamModal } from "./EditTeamModal"

/**
 * Matches the profile Team Up menu's invitation, removal, and leader permissions.
 */
export function InviteUserToTeamButton({
	profileUserId,
	profileUsername,
}: {
	profileUserId: string
	profileUsername: string
}) {
	const { data: session } = authClient().useSession()
	const [isOpen, setIsOpen] = useState(false)
	const [isCreating, setIsCreating] = useState(false)
	const query = useQuery({
		queryKey: ["profile-team-statuses", session?.user.id, profileUserId],
		queryFn: () => fetchProfileTeamStatuses(profileUserId),
		enabled: Boolean(session),
	})
	const mutation = usePageMutation(() => {
		void query.refetch()
	})
	const isFilled = query.data?.some((team) => team.status !== "none")
	return (
		<>
			<Button
				accessibilityLabel="Team Up"
				onPress={() => {
					if (!session) {
						router.push("/sign-up")
						return
					}
					// load team choices for the signed-in account
					setIsOpen(true)
					void query.refetch()
				}}
			>
				<Icon as={Users} className="size-4" fill={isFilled ? "currentColor" : "none"} />
				<Text>Team Up</Text>
			</Button>
			{isOpen && (
				<Sheet title="Team Up" onClose={() => setIsOpen(false)}>
					{query.isPending && <CoffeeLoading />}
					{query.error && <Text className="text-destructive">{query.error.message}</Text>}
					{query.data?.map((team) => (
						<View key={team.teamId} className="flex-row items-center gap-2">
							{team.status === "none" ? (
								<Button
									variant="ghost"
									className="flex-1 justify-start"
									accessibilityLabel={`Invite ${profileUsername} to ${team.name}`}
									disabled={mutation.isPending}
									onPress={() =>
										void mutation.run(async () => {
											const rejection = await sendUserInvite({ teamId: team.teamId }, { username: profileUsername })
											if (rejection) {
												throw new Error(`The invitation to @${profileUsername} didn't go through.`)
											}
										})
									}
								>
									<Text>{team.name}</Text>
								</Button>
							) : (
								<>
									<Text className="flex-1 py-3 text-sm">{team.name}</Text>
									<Button
										variant="ghost"
										size="icon"
										accessibilityLabel={
											team.status === "member"
												? `Remove ${profileUsername} from ${team.name}`
												: `Delete invitation to ${team.name}`
										}
										disabled={
											mutation.isPending ||
											(team.status === "member" ? !isLeaderRole(team.role) : !team.canDeleteInvite)
										}
										onPress={() =>
											void mutation.run(async () => {
												await removeProfileTeam({ team, profileUserId })
											})
										}
									>
										<Icon as={X} className="size-4" />
									</Button>
								</>
							)}
						</View>
					))}
					{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
					<Button
						variant="ghost"
						className="justify-start"
						accessibilityLabel="New team"
						onPress={() => {
							setIsOpen(false)
							setIsCreating(true)
						}}
					>
						<Icon as={Plus} className="size-4" />
						<Text>New team</Text>
					</Button>
				</Sheet>
			)}
			{isCreating && (
				<EditTeamModal initialInvites={[{ username: profileUsername }]} onClose={() => setIsCreating(false)} />
			)}
		</>
	)
}

// keep member removal and invitation cancellation behind their existing permissions
async function removeProfileTeam({
	team,
	profileUserId,
}: {
	team: ProfileTeamStatus
	profileUserId: string
}): Promise<void> {
	if (team.status === "member") {
		if (!(await sendRemoveTeamMember(team.teamId, profileUserId))) {
			throw new Error("A team must have at least one leader.")
		}
	} else if (team.inviteId) {
		await sendDeleteTeamInvite(team.teamId, team.inviteId)
	}
}
