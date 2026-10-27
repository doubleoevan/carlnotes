import { authClient } from "@carlnotes/client/authClient"
import { sendAddTopicTeam } from "@carlnotes/client/teamClient"
import { fetchAddableTopics } from "@carlnotes/client/topicClient"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react-native"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Offers existing topics before creating one, as the web team's Add Topic menu does.
 */
export function AddTopicButton({
	teamId,
	onTopicAdded,
	onNewTopic,
}: {
	teamId: string
	onTopicAdded: () => void
	onNewTopic: () => void
}) {
	const { data: session } = authClient().useSession()
	const [isOpen, setIsOpen] = useState(false)
	const [filter, setFilter] = useState("")
	const query = useQuery({
		queryKey: ["addable-topics", session?.user.id, teamId],
		queryFn: () => fetchAddableTopics(teamId),
		enabled: isOpen,
	})
	const mutation = usePageMutation(() => {
		onTopicAdded()
		void query.refetch()
	})
	const topics = query.data?.filter((topic) => topic.name.toLowerCase().includes(filter.trim().toLowerCase()))
	return (
		<>
			<Button accessibilityLabel="Add Topic" onPress={() => setIsOpen(true)}>
				<Icon as={Plus} className="size-4" />
				<Text>Add Topic</Text>
			</Button>
			{isOpen && (
				<Sheet title="Add Topic" onClose={() => setIsOpen(false)}>
					<SessionTextInput
						label="Filter your topics"
						value={filter}
						onChangeText={setFilter}
						placeholder="Search your topics…"
					/>
					{query.isPending && <CoffeeLoading />}
					{query.error && <Text className="text-destructive">{query.error.message}</Text>}
					{topics?.map((topic) => (
						<Button
							key={topic.id}
							variant="ghost"
							className="justify-start"
							accessibilityLabel={`Add ${topic.name}`}
							disabled={mutation.isPending}
							onPress={() =>
								void mutation.run(async () => {
									const rejection = await sendAddTopicTeam(teamId, topic.id)
									if (rejection) {
										throw new Error(rejection)
									}
									setIsOpen(false)
								})
							}
						>
							<Text>{topic.name}</Text>
						</Button>
					))}
					{topics?.length === 0 && <Text className="text-muted-foreground">No topics matched that name.</Text>}
					{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
					<Button
						variant="ghost"
						className="justify-start"
						accessibilityLabel="New topic"
						onPress={() => {
							setIsOpen(false)
							onNewTopic()
						}}
					>
						<Icon as={Plus} className="size-4" />
						<Text>New topic</Text>
					</Button>
				</Sheet>
			)}
		</>
	)
}
