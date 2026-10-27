import { authClient } from "@carlnotes/client/authClient"
import { fetchLeaderTeams, sendAddTopicTeam, sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useQuery } from "@tanstack/react-query"
import { Plus, X } from "lucide-react-native"
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
 * Adds or removes a Topic from a led team, or creates a team with the Topic selected.
 */
export function AddTopicToTeamDialog({
	topic,
	onTopicTeamsChanged,
	onClose,
}: {
	topic: Pick<TopicResponse, "id" | "name" | "roomTeams" | "team">
	onTopicTeamsChanged: () => void
	onClose: () => void
}) {
	const { data: session } = authClient().useSession()
	const [isCreating, setIsCreating] = useState(false)
	const [changedIds, setChangedIds] = useState<Record<string, boolean>>({})
	const query = useQuery({ queryKey: ["leader-teams", session?.user.id], queryFn: fetchLeaderTeams })
	const mutation = usePageMutation(onTopicTeamsChanged)
	const holding = new Set([...topic.roomTeams.map((team) => team.teamId), ...(topic.team ? [topic.team.teamId] : [])])
	if (isCreating) {
		return (
			<EditTeamModal
				initialTopicIds={[topic.id]}
				onClose={() => setIsCreating(false)}
				onSaved={() => {
					onTopicTeamsChanged()
					onClose()
				}}
			/>
		)
	}
	return (
		<Sheet title="Add topic to team" onClose={onClose}>
			<View className="gap-2">
				{query.isPending && <CoffeeLoading />}
				{query.error && <Text className="text-destructive">{query.error.message}</Text>}
				{query.data?.map((team) => {
					const includesTopic = changedIds[team.teamId] ?? holding.has(team.teamId)
					return (
						<Button
							key={team.teamId}
							variant="ghost"
							className="justify-start"
							accessibilityLabel={`${includesTopic ? "Remove topic from" : "Add topic to"} ${team.name}`}
							disabled={mutation.isPending}
							onPress={() =>
								void mutation.run(async () => {
									if (includesTopic) {
										if (!(await sendRemoveTopicFromTeam(team.teamId, topic.id))) {
											throw new Error("That topic didn't get removed.")
										}
									} else {
										const rejection = await sendAddTopicTeam(team.teamId, topic.id)
										if (rejection) {
											throw new Error(rejection)
										}
									}
									setChangedIds((ids) => ({ ...ids, [team.teamId]: !includesTopic }))
								})
							}
						>
							<Icon as={includesTopic ? X : Plus} className="size-4" />
							<Text>{team.name}</Text>
						</Button>
					)
				})}
				{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
				<Button
					variant="ghost"
					className="justify-start"
					accessibilityLabel="New team"
					onPress={() => setIsCreating(true)}
				>
					<Icon as={Plus} className="size-4" />
					<Text>New team</Text>
				</Button>
			</View>
		</Sheet>
	)
}
