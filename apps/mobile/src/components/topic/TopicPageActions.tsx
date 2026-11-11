import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { type FetchTopicPageOptions, sendDeleteTopic, sendTopicSubscription } from "@carlnotes/client/topicClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useTopicPodcastEpisodeVideoEditableImage } from "@carlnotes/core/hooks/useTopicPodcastEpisodeVideoEditableImage"
import { toTopicPageEditedPodcastEpisode } from "@carlnotes/core/lib/podcastEpisodeEditor"
import { PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toTopicActionLayout } from "@carlnotes/core/lib/topicActions"
import { cn } from "@carlnotes/nightshift/classNames"
import { router } from "expo-router"
import { ListOrdered, PawPrint, Pencil, Trash2, Users } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { ProfileRankDialog } from "@/components/common/RankDialog"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { PageActionMenu, type PageActionOption } from "@/components/search/PageActionMenu"
import {
	ADD_TOPIC_TO_TEAM_LABEL,
	toAddTopicToTeamOption,
	toEditTopicPodcastEpisodeVideoOption,
	toShareTopicOption,
} from "@/components/search/pageActionOptions"
import { ShareTopic, ShareTopicSheet } from "@/components/share/ShareTopic"
import { AddTopicToTeamDialog } from "@/components/team/AddTopicToTeamDialog"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { usePageMutation } from "@/hooks/usePageMutation"
import {
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PAGE_BUTTON_ROW_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { offerPushPermission } from "@/pushPermission"
import { openSessionScreen } from "@/sessionReturnPath"
import { EditImageDialog } from "./EditImageDialog"
import { EditTopicDialog } from "./TopicEditorChoiceSheet"
import { NewTopicButton } from "./TopicHomeActions"
import { TopicScanButton } from "./TopicScanButton"

// a visitor's follow sends them to sign-up with the web's follow prompt, and returns them to the Topic
function openSubscribeSignup(topicId: string): void {
	openSessionScreen({ screen: "/sign-up", returnPath: `/topics/${topicId}`, cta: "subscribe" })
}

/**
 * Places Topic controls according to the shared action layout.
 */
export function TopicActionBar({
	topic,
	onRefresh,
	onScanned,
}: {
	topic: TopicResponse
	onRefresh: () => void
	onScanned: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
}) {
	// keep team selection above the current Topic without losing its scroll position
	const [isAddingToTeam, setIsAddingToTeam] = useState(false)
	const { data: session } = authClient().useSession()
	const layout = toTopicPageActionLayout({ topic, isSignedIn: Boolean(session) })
	return (
		<View className={cn("mx-4 mt-2", PAGE_BUTTON_ROW_CLASS)}>
			{/* secondary action and primary call to action. the row's margin leaves 16 points above it, under the search
			    bar's margin, as the header's margin leaves below it */}
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
					<Button
						variant="outline"
						className={PLAIN_PAGE_BUTTON_CLASS}
						accessibilityLabel={ADD_TOPIC_TO_TEAM_LABEL}
						onPress={() => setIsAddingToTeam(true)}
					>
						<Icon as={Users} className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>Team Up</Text>
					</Button>
				)}
				{layout.isShareOnLeft && <ShareTopic topic={topic} isLabeled isIconHighlighted />}
			</View>
			<View className="flex-row flex-wrap justify-end gap-2">
				<TopicScanButton topic={topic} onScanned={onScanned} />
				{layout.isNewTopicCallToAction && <NewTopicButton />}
				{layout.isSubscribeCallToAction && (
					<Button
						className={HIGHLIGHTED_PAGE_BUTTON_CLASS}
						accessibilityLabel="Follow topic"
						onPress={() => openSubscribeSignup(topic.id)}
					>
						<Icon as={PawPrint} className="size-4" />
						<Text>Follow topic</Text>
					</Button>
				)}
				{layout.isJoinCallToAction && topic.teamLink && (
					<JoinTeamButton
						teamId={topic.teamLink.teamId}
						name={topic.teamLink.name}
						hasRequestedToJoin={topic.hasRequestedToJoin}
						onChanged={onRefresh}
					/>
				)}
			</View>
			{isAddingToTeam && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onRefresh} onClose={() => setIsAddingToTeam(false)} />
			)}
		</View>
	)
}

/**
 * Opens the shared Topic actions with editing, team selection, and confirmation.
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
	const [dialog, setDialog] = useState<TopicActionDialogKind | null>(null)
	const mutation = usePageMutation(onRefresh)
	const feed = useTopicFeed()
	const { data: session } = authClient().useSession()
	const actionOptions: PageActionOption[] = []

	// preserve the web's follow, team, share, edit, and delete order
	if (topic) {
		const layout = toTopicPageActionLayout({ topic, isSignedIn: Boolean(session) })
		if (layout.isSubscribeInMenu) {
			actionOptions.push({
				label: topic.isSubscribed ? "Unfollow topic" : "Follow topic",
				icon: PawPrint,
				isActive: topic.isSubscribed,
				isDisabled: mutation.isPending,
				onSelect: () =>
					session ? void mutation.run(() => toggleTopicSubscription(topic)) : openSubscribeSignup(topic.id),
			})
		}
		actionOptions.push(...toProfileRankOptions(topic, () => setDialog("rank-profile")))
		if (layout.isAddTopicToTeamInMenu) {
			actionOptions.push(toAddTopicToTeamOption(() => setDialog("team")))
		}
		actionOptions.push(toShareTopicOption(() => setDialog("share")))
		// Edit film, for a topic whose latest podcast episode has a film, leads the editing options, as on the web
		actionOptions.push(...toEditTopicPodcastEpisodeVideoOptions(topic, () => setDialog("edit-film")))
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
				hasNewTopicButton={
					!topic || toTopicPageActionLayout({ topic, isSignedIn: Boolean(session) }).isNewTopicCallToAction
				}
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

// Edit film for a user who may edit the topic's latest film, and no option for anyone else or a topic with no film
function toEditTopicPodcastEpisodeVideoOptions(topic: TopicResponse, onSelect: () => void): PageActionOption[] {
	return toTopicPageEditedPodcastEpisode(topic) ? [toEditTopicPodcastEpisodeVideoOption(onSelect)] : []
}

// a public topic's owner arranges their own profile's featured topics from inside the topic, as on the web
function toProfileRankOptions(topic: TopicResponse, onSelect: () => void): PageActionOption[] {
	return topic.isTopicOwner && topic.visibility === "public"
		? [{ label: PROFILE_RANK_OPTION_LABELS.topics, icon: ListOrdered, onSelect }]
		: []
}

// the dialogs the topic's action menu opens, one at a time
type TopicActionDialogKind = "edit" | "edit-film" | "team" | "share" | "rank-profile"

// keep the chosen form mounted independently of the menu
function TopicActionDialog({
	topic,
	dialog,
	onClose,
	onRefresh,
}: {
	topic: TopicResponse
	dialog: TopicActionDialogKind | null
	onClose: () => void
	onRefresh: () => void
}) {
	// the podcast episode of the topic's latest film, for a user who may edit it
	const editedPodcastEpisode = toTopicPageEditedPodcastEpisode(topic)
	return (
		<>
			{/* the image sheet of the topic's latest film, which the action menu's Edit film opens */}
			{dialog === "edit-film" && editedPodcastEpisode && (
				<TopicPodcastEpisodeVideoImageDialog
					podcastEpisode={editedPodcastEpisode}
					onImageChanged={onRefresh}
					onClose={() => onClose()}
				/>
			)}
			{dialog === "edit" && (
				<EditTopicDialog
					topic={topic}
					onClose={() => onClose()}
					onTopicSaved={onRefresh}
					onTopicImageChanged={onRefresh}
				/>
			)}
			{dialog === "team" && (
				<AddTopicToTeamDialog topic={topic} onTopicTeamsChanged={onRefresh} onClose={() => onClose()} />
			)}
			{dialog === "share" && <ShareTopicSheet topic={topic} onClose={() => onClose()} />}
			{dialog === "rank-profile" && (
				<ProfileRankDialog
					rankedNoun="topics"
					pageItem={{ id: topic.id, label: topic.name }}
					onClose={() => onClose()}
				/>
			)}
		</>
	)
}

// the podcast episode whose film's image the sheet edits, the call after each new image is in place, and the close
type TopicPodcastEpisodeVideoImageDialogProps = {
	podcastEpisode: PodcastEpisode
	onImageChanged: () => void
	onClose: () => void
}

// the Edit film sheet on the topic screen, which opens once the podcast episode's page loads with the editor's view
// of the film's image. a page that does not load reports it and closes
function TopicPodcastEpisodeVideoImageDialog({
	podcastEpisode,
	onImageChanged,
	onClose,
}: TopicPodcastEpisodeVideoImageDialogProps) {
	const editableImage = useTopicPodcastEpisodeVideoEditableImage({
		podcastEpisode,
		onLoadFailed: () => {
			showClientError(REQUEST_FAILED_TEXT)
			onClose()
		},
	})
	if (!editableImage) {
		return null
	}
	return <EditImageDialog editableImage={editableImage} onImageChanged={onImageChanged} onClose={onClose} />
}

// the signed-in state for the active Topic
type ToTopicPageActionLayoutOptions = {
	topic: TopicResponse
	isSignedIn: boolean
}

// apply the same visitor and account permissions as the web
function toTopicPageActionLayout({
	topic,
	isSignedIn,
}: ToTopicPageActionLayoutOptions): ReturnType<typeof toTopicActionLayout> {
	return toTopicActionLayout({
		topic,
		isSignedIn,
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

// follow or unfollow the Topic, and after a follow, explain the notifications a followed Topic can send
async function toggleTopicSubscription(topic: TopicResponse): Promise<void> {
	await sendTopicSubscription(topic.id, !topic.isSubscribed)
	if (!topic.isSubscribed) {
		void offerPushPermission()
	}
}
