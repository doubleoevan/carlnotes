import { authClient } from "@carlnotes/client/authClient"
import type { FetchTopicPageOptions } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import { useState } from "react"
import { Text as NativeText, RefreshControl, ScrollView, View } from "react-native"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Footer } from "@/components/layout/Footer"
import { PodcastEpisodePlayer } from "@/components/podcast/PodcastEpisodePlayer"
import { Badge } from "@/components/primitives/badge"
import { Text } from "@/components/primitives/text"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
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
	return (
		<ScrollView
			refreshControl={<RefreshControl refreshing={state.isReheating} onRefresh={onRefresh} />}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<TopicActionBar topic={topic} onRefresh={onRefresh} onScanned={onScanned} />
			{/* the image with the title in the page's own type sizes, the tags, and the byline and the reactions beside it,
			    as the web header shows them at phone width. React Native has no float, so they stay beside the image */}
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
					</View>
				</View>
			</View>
			{/* full-width cards match the web's narrow reading column */}
			<View className="mx-4">
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
				>
					<TopicFindingsSection topic={topic} findings={findings} state={state} />
				</CollapsibleSection>
				{/* the topic's comment thread, whose first page came with the topic */}
				<SocialSection
					target={{ kind: "topic", id: topic.id }}
					firstPage={topic.commentThread}
					isSignedIn={Boolean(session)}
					topicId={topic.id}
					isTopicOwner={topic.isTopicOwner}
				/>
			</View>
			<TopicPageCards topic={topic} />
			<TopicCountsLine topic={topic} />
			<Footer />
			{/* the image sheet that an editor's press on the header image opens */}
			{isImageDialogOpen && (
				<EditImageDialog
					subject={{ kind: "topic", ...topic }}
					onImageChanged={onRefresh}
					onClose={() => setIsImageDialogOpen(false)}
				/>
			)}
		</ScrollView>
	)
}
