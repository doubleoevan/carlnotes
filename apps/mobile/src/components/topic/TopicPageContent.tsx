import { authClient } from "@carlnotes/client/authClient"
import type { FetchTopicPageOptions } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { toTopicDetails } from "@carlnotes/core/lib/detailsLine"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import { type ComponentRef, useRef, useState } from "react"
import { Text as NativeText, RefreshControl, ScrollView, View } from "react-native"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Footer } from "@/components/layout/Footer"
import { SectionTargetContext } from "@/components/layout/SectionAnchor"
import { PodcastEpisodePlayer } from "@/components/podcast/PodcastEpisodePlayer"
import { TopicPodcastEpisodeVideoSection } from "@/components/podcast/TopicPodcastEpisodeVideoSection"
import { Badge } from "@/components/primitives/badge"
import { Text } from "@/components/primitives/text"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import { TopicPostsSection } from "@/components/topicPost/TopicPostsSection"
import { useSectionTargetScroll } from "@/hooks/useSectionTargetScroll"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { CollapsibleSection } from "./CollapsibleSection"
import { EditImageDialog } from "./EditImageDialog"
import { TopicByline } from "./TopicByline"
import { TopicCountsLine } from "./TopicCountsLine"
import { TopicFindingsSection } from "./TopicFindingsSection"
import { TopicHeaderImage } from "./TopicImageButton"
import { TopicInfoButton } from "./TopicInfo"
import { TopicActionBar } from "./TopicPageActions"
import { TopicPageCards } from "./TopicPageCards"
import { TopicScanButton } from "./TopicScanButton"

/**
 * Keeps the web Topic page's header, Findings, and cards in one native scroll area.
 */
export function TopicPageContent({
	topic,
	findings,
	state,
	onRefresh,
	onScanned,
}: {
	topic: TopicResponse
	findings: TopicFinding[]
	state: Pick<TopicFeedState, "handlers" | "pendingChanges" | "isReheating">
	onRefresh: () => void
	onScanned: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
}) {
	// a visitor's press on a reaction or the composer opens sign-up, and an editor's press on the image opens its sheet
	const { data: session } = authClient().useSession()
	const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)

	// the counts that the comment thread and the notes section report once they load, for the header's details line
	const [commentCount, setCommentCount] = useState<number | null>(null)
	const [noteCount, setNoteCount] = useState<number | null>(null)

	// the scroll view that a Coffee Break films row scrolls to Topic Cinema, and that opens at a linked comment
	const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null)
	const { sectionTargetRef, scrollHandlers } = useSectionTargetScroll(scrollViewRef)
	return (
		<ScrollView
			ref={scrollViewRef}
			{...scrollHandlers}
			refreshControl={<RefreshControl refreshing={state.isReheating} onRefresh={onRefresh} />}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<TopicActionBar topic={topic} onRefresh={onRefresh} onScanned={onScanned} />
			{/* the image with the title in the page's own type sizes, the tags, the byline and the reactions, and the
			    details line of the screen's counts beside it, as the web header shows them at phone width. React Native
			    has no float, so they stay beside the image */}
			<View className="mx-4 my-4">
				<View className="flex-row items-start gap-4">
					<TopicHeaderImage
						image={topic.image}
						name={topic.name}
						editLabel={EDIT_IMAGE_DIALOG_TITLES.topic}
						onEdit={topic.canEdit ? () => setIsImageDialogOpen(true) : undefined}
					/>
					<View className="min-w-0 flex-1">
						<TopicInfoButton topic={topic}>
							<NativeText
								accessibilityRole="header"
								style={toTypeRoleStyle("pageTitle")}
								className="shrink text-foreground"
							>
								{topic.name}
							</NativeText>
						</TopicInfoButton>
						{/* the chat mention and note count sits under the name, and its press opens the chat room */}
						<PageUpdateCountBadge topicId={topic.id} className="self-start" />
						{topic.tags.length > 0 ? (
							<View className="mt-1.5 flex-row flex-wrap gap-1">
								{topic.tags.map((tag) => (
									<Badge key={tag} variant="secondary">
										<Text>{tag}</Text>
									</Badge>
								))}
							</View>
						) : null}
						{/* the byline and the topic's reactions */}
						<View className="mt-1.5 flex-row flex-wrap items-center gap-x-3">
							<TopicByline topic={topic} isPage />
							<ReactionRow
								target={{ kind: "topic", id: topic.id }}
								summary={topic.reactions}
								isSignedIn={Boolean(session)}
							/>
						</View>
						{/* the counts of the screen's sections, on their own line */}
						<DetailsLine
							className="mt-1"
							details={toTopicDetails({ topic, findingCount: findings.length, commentCount, noteCount })}
						/>
					</View>
				</View>
			</View>
			{/* full-width cards match the web's narrow reading column */}
			<View className="mx-4">
				<TopicPodcastEpisodeVideoSection
					topic={topic}
					onVideoRenderingPoll={() => onScanned({ isPoll: true })}
					scrollViewRef={scrollViewRef}
				/>
				<PodcastEpisodePlayer
					topic={topic}
					topicFeedHandlers={state.handlers}
					scanControl={<TopicScanButton topic={topic} onScanned={onScanned} />}
				/>
				<CollapsibleSection
					title="Topic findings"
					titleAside={
						topic.newCount > 0 ? <Text className="text-sm font-semibold text-badge">{topic.newCount} new</Text> : null
					}
					hasClosedDivider
				>
					<TopicFindingsSection topic={topic} findings={findings} state={state} />
				</CollapsibleSection>
				{/* the topic's comment thread, whose first page came with the topic. the screen opens at a linked comment */}
				<SectionTargetContext value={sectionTargetRef}>
					<SocialSection
						target={{ kind: "topic", id: topic.id }}
						firstPage={topic.commentThread}
						isSignedIn={Boolean(session)}
						topicId={topic.id}
						isTopicOwner={topic.isTopicOwner}
						hasClosedDivider
						onCommentCountChange={setCommentCount}
					/>
				</SectionTargetContext>
				{/* the topic's Topic Posts, right below its comment thread */}
				{topic.topicPosts && <TopicPostsSection topicId={topic.id} {...topic.topicPosts} />}
			</View>
			<TopicPageCards topic={topic} onNoteCountChange={setNoteCount} />
			<TopicCountsLine topic={topic} />
			<Footer />
			{/* the image sheet that an editor's press on the header image opens */}
			{isImageDialogOpen && (
				<EditImageDialog
					editableImage={{ kind: "topic", ...topic }}
					onImageChanged={onRefresh}
					onClose={() => setIsImageDialogOpen(false)}
				/>
			)}
		</ScrollView>
	)
}
