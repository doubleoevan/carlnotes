import { showClientError } from "@carlnotes/client/apiClient"
import { sendDeleteTopic, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toTopicActionLayout } from "@carlnotes/core/lib/topicActions"
import { router } from "expo-router"
import { PawPrint, Pencil, Share2, Trash2, Users } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { PageActionMenu, type PageActionOption } from "@/components/search/PageActionMenu"
import { ShareTopic, ShareTopicSheet } from "@/components/share/ShareTopic"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { usePageMutation } from "@/hooks/usePageMutation"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { EditTopicModal } from "./EditTopicModal"
import { NewTopicButton } from "./TopicHomeActions"
import { TopicScanButton } from "./TopicScanButton"

/**
 * Places working native Topic controls according to the shared web action layout.
 */
export function TopicActionBar({
	topic,
	onRefresh,
	onScanned,
}: {
	topic: TopicResponse
	onRefresh: () => void
	onScanned: () => Promise<void>
}) {
	// keep team selection above the current Topic without losing its scroll position
	const [isAddingToTeam, setIsAddingToTeam] = useState(false)
	const layout = toNativeTopicActionLayout(topic)
	return (
		<View className="mx-4 mt-1 mb-3 flex-row flex-wrap items-start justify-between gap-3">
			{/* secondary action and primary call to action */}
			<View>
				{layout.isJoinOnLeft && topic.teamLink && (
					<JoinTeamButton
						teamId={topic.teamLink.teamId}
						name={topic.teamLink.name}
						hasRequestedToJoin={topic.hasRequestedToJoin}
						isHighlighted={false}
						onChanged={onRefresh}
					/>
				)}
				{layout.isAddTopicToTeamOnLeft && (
					<Button variant="outline" accessibilityLabel="Add topic to team" onPress={() => setIsAddingToTeam(true)}>
						<Icon as={Users} className="size-4" />
						<Text>Team Up</Text>
					</Button>
				)}
				{layout.isShareOnLeft && <ShareTopic topic={topic} isLabeled />}
			</View>
			<View>
				<TopicScanButton topic={topic} onScanned={onScanned} />
				{layout.isNewTopicCallToAction && <NewTopicButton />}
			</View>
			{isAddingToTeam && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onRefresh} onClose={() => setIsAddingToTeam(false)} />
			)}
		</View>
	)
}

/**
 * Opens the same Topic actions as web with native editing, team selection, and confirmation.
 */
export function TopicPageActions({
	topic,
	title = topic ? "Topic actions" : "Home actions",
	onRefresh,
}: {
	topic?: TopicResponse
	title?: string
	onRefresh: () => void
}) {
	// retain each dialog independently of the menu that opens it
	const [dialog, setDialog] = useState<"edit" | "team" | "share" | null>(null)
	const mutation = usePageMutation(onRefresh)
	const feed = useTopicFeed()
	const actionOptions: PageActionOption[] = []

	// preserve the web's follow, team, share, edit, and delete order
	if (topic) {
		const layout = toNativeTopicActionLayout(topic)
		if (layout.isSubscribeInMenu) {
			actionOptions.push({
				label: topic.isSubscribed ? "Unfollow topic" : "Follow topic",
				icon: PawPrint,
				isActive: topic.isSubscribed,
				isDisabled: mutation.isPending,
				onSelect: () => void mutation.run(() => sendTopicSubscription(topic.id, !topic.isSubscribed)),
			})
		}
		if (layout.isAddTopicToTeamInMenu) {
			actionOptions.push({ label: "Add topic to team", icon: Users, onSelect: () => setDialog("team") })
		}
		actionOptions.push({ label: "Share topic", icon: Share2, onSelect: () => setDialog("share") })
		if (topic.canEdit) {
			actionOptions.push(
				{ label: "Edit topic", icon: Pencil, onSelect: () => setDialog("edit") },
				{
					label: "Delete topic",
					icon: Trash2,
					isDisabled: mutation.isPending,
					onSelect: () =>
						confirmDeleteTopic(topic, async () => {
							await feed.reheat()
							router.replace("/")
						}),
				},
			)
		}
	}
	return (
		<>
			<PageActionMenu
				page={title.replace(/ actions$/, "")}
				options={actionOptions}
				report={topic ? { subjectKind: "topic", subjectId: topic.id, subjectLabel: topic.name } : undefined}
				hasNewTopicButton={!topic || toNativeTopicActionLayout(topic).isNewTopicCallToAction}
			/>
			{mutation.error && (
				<Text accessibilityRole="alert" className="text-xs text-destructive">
					{mutation.error}
				</Text>
			)}
			{topic && (
				<TopicActionDialog topic={topic} dialog={dialog} onClose={() => setDialog(null)} onRefresh={onRefresh} />
			)}
		</>
	)
}

// keep the chosen form mounted independently of the menu
function TopicActionDialog({
	topic,
	dialog,
	onClose,
	onRefresh,
}: {
	topic: TopicResponse
	dialog: "edit" | "team" | "share" | null
	onClose: () => void
	onRefresh: () => void
}) {
	return (
		<>
			{dialog === "edit" && <EditTopicModal topic={topic} onClose={() => onClose()} onTopicSaved={onRefresh} />}
			{dialog === "team" && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onRefresh} onClose={() => onClose()} />
			)}
			{dialog === "share" && <ShareTopicSheet topic={topic} onClose={() => onClose()} />}
		</>
	)
}

// the mobile screens require sign-in and use the same join permission as the web
function toNativeTopicActionLayout(topic: TopicResponse): ReturnType<typeof toTopicActionLayout> {
	return toTopicActionLayout({
		topic,
		isSignedIn: true,
		isBookmarkedView: false,
		isJoinable: topic.roomTeams.length === 0 && topic.teamLink !== null,
	})
}

// require an explicit destructive choice before deleting a Topic and its history
function confirmDeleteTopic(topic: TopicResponse, onDeleted: () => Promise<void>): void {
	Alert.alert(
		"Delete this topic?",
		`'${topic.name}' and its ${topic.findings.length} findings and ${topic.scans.length} scans go with it.`,
		[
			{ text: "Keep it", style: "cancel" },
			{
				text: "Delete topic",
				style: "destructive",
				onPress: () => {
					void sendDeleteTopic(topic.id)
						.then(onDeleted)
						.catch((error: unknown) =>
							showClientError(error instanceof Error ? error.message : "That topic didn't get deleted. Try again."),
						)
				},
			},
		],
	)
}
