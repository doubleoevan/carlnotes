import { authClient } from "@carlnotes/client/authClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toHostWithoutWww, toTopicPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { CommentThreadResponse } from "@carlnotes/contracts/social"
import { toPlainText } from "@carlnotes/contracts/spokenText"
import { toOneLineText } from "@carlnotes/contracts/text"
import { useFindingTopic } from "@carlnotes/core/hooks/useFindingTopic"
import { useSubjectReportFlag } from "@carlnotes/core/hooks/useSubjectReport"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { isFindingRatedDown } from "@carlnotes/core/lib/topicFindingFilters"
import { toNotesMarkdown } from "@carlnotes/core/lib/topicScanRecap"
import { togglePodcastEpisodeFindingPlayback } from "@carlnotes/core/stores/podcastEpisodePlayActions"
import { Bookmark, Check, Circle, ExternalLink, Flag } from "lucide-react-native"
import { Text, View } from "react-native"
import { toActiveIconProps } from "@/activeIconProps"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ReportIssueDialog } from "@/components/common/ReportIssueDialog"
import { ScrollBox } from "@/components/common/ScrollBox"
import { ShareMarkdownButton } from "@/components/common/ShareMarkdownButton"
import { Sheet, type SheetProps } from "@/components/common/Sheet"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text as ButtonText } from "@/components/primitives/text"
import { TopicImage } from "@/components/primitives/topic-image"
import { ReactionRow } from "@/components/social/ReactionRow"
import { SocialSection } from "@/components/social/SocialSection"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent, toPublicTopicProperties } from "@/visitAnalytics"
import { FindingLinkPreview } from "./FindingLinkPreview"
import { TopicByline } from "./TopicByline"
import { TopicFindingRating } from "./TopicFindingRating"
import { ResourceMetadata } from "./TopicFindingSummary"
import type { TopicResourceProps } from "./TopicResource"

// a sheet keeps the row's confirmed and pending state live. a supplied comment thread keeps stories offline
export type TopicResourceInfoProps = TopicResourceProps &
	Pick<SheetProps, "triggerRef" | "onClose"> & { isSignedIn?: boolean; commentThread?: CommentThreadResponse }

/**
 * Presents the web's finding details and actions in a native sheet.
 */
export function TopicResourceInfo(props: TopicResourceInfoProps) {
	// resolve action visibility from the current session or story override
	const { data: session } = authClient().useSession()
	const isSignedIn = props.isSignedIn ?? Boolean(session)

	// record source openings and inline playback as views
	const { resource, topic, topicFindingRank, topicFeedHandlers, triggerRef, onClose } = props
	const title = toOneLineText(toPlainText(resource.title ?? "")) || resource.url
	const handleOpen = (): void => topicFeedHandlers.openTopicFinding(resource.findingId)
	const findingTarget = { kind: "finding", id: resource.findingId } as const
	// a link or a podcast episode chapter can still open a finding rated thumbs down, which has no reactions or comments
	const isSocialShown = !isFindingRatedDown(resource)
	const reportFlag = useSubjectReportFlag({ subjectKind: "finding", subjectId: resource.findingId })
	const handleTitlePress = (): void => {
		// report the explicit source click using the same public-topic rule as web
		captureVisitEvent("visit_finding_clicked", {
			host: toHostWithoutWww(resource.url),
			...toPublicTopicProperties(topic),
		})
		handleOpen()
	}
	const markdown = toNotesMarkdown({
		topicId: topic.id,
		topicName: topic.name,
		prompt: topic.prompt,
		note: `[${resource.title ?? resource.url}](${resource.url})\n\n${resource.relevanceExplanation}`,
		origin: SITE_URL,
	})
	return (
		<Sheet title="Topic Finding" triggerRef={triggerRef} onClose={onClose}>
			{/* the source title and metadata */}
			<View className="mb-3 flex-row items-start gap-2.5">
				{topicFindingRank != null ? (
					<Text style={toTypeRoleStyle("sectionLabel")} className="pt-3 text-muted-foreground">
						{topicFindingRank}
					</Text>
				) : null}
				<View className="flex-1 gap-1">
					<AnchorLink
						href={resource.url}
						accessibilityLabel={`Open ${title}`}
						onPress={handleTitlePress}
						hitSlop={toTouchTargetHitSlop(44)}
						className="min-h-11 flex-row items-center gap-1 active:opacity-75"
					>
						<Text style={toTypeRoleStyle("label")} className="shrink text-link">
							{title}
						</Text>
						<Icon as={ExternalLink} className="size-3.5 text-link" />
					</AnchorLink>
					<ResourceMetadata resource={resource} latestPodcastEpisode={props.latestPodcastEpisode} />
					{isSocialShown ? (
						<ReactionRow
							target={findingTarget}
							summary={resource.reactions}
							isSignedIn={isSignedIn}
							onSummaryChange={(reactions) =>
								topicFeedHandlers.keepTopicFindingReactions(resource.findingId, reactions)
							}
						/>
					) : null}
				</View>
			</View>
			<FindingLinkPreview findingId={resource.findingId} linkPreview={props.linkPreview} onOpen={handleOpen} />
			{/* keep actions in reach below the same bounded notes as the web */}
			<Text style={toTypeRoleStyle("sectionLabel")} className="mb-1 text-muted-foreground">
				{"Carl's notes"}
			</Text>
			<ScrollBox
				scrollToTopOn={resource.findingId}
				copyMarkdown={markdown}
				actions={<ShareMarkdownButton markdown={markdown} />}
			>
				<Text selectable style={toTypeRoleStyle("body")} className="text-popover-foreground">
					{toPlainText(resource.relevanceExplanation) || "No notes yet."}
				</Text>
			</ScrollBox>
			{/* the topic the finding belongs to with its byline, then a divider */}
			<FindingTopic
				topic={topic}
				latestPodcastEpisode={props.latestPodcastEpisode ?? null}
				findingId={resource.findingId}
				onClose={onClose}
			/>
			<View className="my-3 flex-row justify-between gap-4">
				<View className="gap-1">
					<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
						Fetched
					</Text>
					<Text style={toTypeRoleStyle("body")} className="text-popover-foreground">
						{toDateLabel(resource.fetchedAt)}
					</Text>
				</View>
				<View className="items-end gap-1">
					<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
						Views
					</Text>
					<Text style={toTypeRoleStyle("body")} className="text-popover-foreground">
						{resource.viewCount.toLocaleString()}
					</Text>
				</View>
			</View>
			{/* permission-aware actions keep the same order and words as the web */}
			{isSignedIn && (
				<View className="gap-3 border-t border-border pt-3" accessibilityState={{ busy: props.isPending }}>
					{topic.canRate ? <TopicFindingRating {...props} /> : null}
					<FindingActions {...props} />
				</View>
			)}
			{/* the finding's comment thread, which loads as the sheet opens */}
			{isSocialShown ? (
				<View className="-mt-4">
					<SocialSection
						target={findingTarget}
						firstPage={props.commentThread}
						isSignedIn={isSignedIn}
						topicId={topic.id}
						isTopicOwner={"isTopicOwner" in topic && topic.isTopicOwner}
					/>
				</View>
			) : null}
			{/* a signed-in user's flag of the finding itself */}
			{isSignedIn && (
				<Button
					variant="ghost"
					className="-mt-3 self-start px-0"
					accessibilityLabel={reportFlag.label}
					onPress={reportFlag.press}
				>
					<Icon as={Flag} {...toActiveIconProps(reportFlag.isReported)} />
					<ButtonText>{reportFlag.label}</ButtonText>
				</Button>
			)}
			{reportFlag.isReporting && (
				<ReportIssueDialog
					subjectKind="finding"
					subjectId={resource.findingId}
					subjectLabel={title}
					onClose={reportFlag.closeReport}
				/>
			)}
		</Sheet>
	)
}

// the finding's topic over a divider: its image beside its name, which links to its page, the latest podcast episode's
// play button, which starts the finding's chapter, and its byline. a caller without the byline and image has them read,
// with the loading line in their place until the read finishes
function FindingTopic({
	topic,
	latestPodcastEpisode,
	findingId,
	onClose,
}: {
	topic: TopicResourceProps["topic"]
	// the topic's latest podcast episode, whose play button follows the topic's name
	latestPodcastEpisode: PodcastEpisode | null
	// the finding whose chapter the play button starts, or the whole podcast episode if no chapter narrates it
	findingId: string
	// closes the sheet on a press of either link
	onClose: () => void
}) {
	const { findingTopic, isLoading } = useFindingTopic({ topicId: topic.id, knownFields: topic })
	// the byline's 44pt touch target already leaves space under the row, so the bottom padding is smaller than the top
	return (
		<View className="gap-1 border-b border-separator pt-3 pb-1">
			<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
				Topic
			</Text>
			{isLoading ? (
				<CoffeeLoading className="min-h-12" />
			) : (
				<View className="flex-row items-center gap-3">
					<AnchorLink
						href={toTopicPath(topic)}
						accessibilityLabel={`Open ${topic.name}`}
						onPress={onClose}
						className="shrink-0 active:opacity-75"
					>
						<TopicImage image={findingTopic?.image ?? null} size="list" name={topic.name} className="h-12 w-18" />
					</AnchorLink>
					<View className="min-w-0 flex-1">
						{/* the name, then the latest podcast episode's play button, as on the topic page */}
						<View className="flex-row items-center gap-2">
							<AnchorLink
								href={toTopicPath(topic)}
								accessibilityLabel={`Open ${topic.name}`}
								onPress={onClose}
								hitSlop={toTouchTargetHitSlop(44)}
								className="shrink active:opacity-75"
							>
								<Text style={toTypeRoleStyle("label")} className="text-link">
									{topic.name}
								</Text>
							</AnchorLink>
							{latestPodcastEpisode ? (
								<PodcastEpisodePlayButton
									podcastEpisode={latestPodcastEpisode}
									onPress={() => togglePodcastEpisodeFindingPlayback(latestPodcastEpisode, findingId)}
								/>
							) : null}
						</View>
						{findingTopic ? <TopicByline topic={findingTopic} isInset={false} /> : null}
					</View>
				</View>
			)}
		</View>
	)
}

// keep bookmarked and consumed state independent
function FindingActions({ resource, topic, topicFeedHandlers, isPending }: TopicResourceProps) {
	// allow removal after topic permissions change
	const hasBookmarkAccess = "canBookmark" in topic ? topic.canBookmark : topic.isTopicOwner || topic.isTeamMember
	const canBookmark = hasBookmarkAccess || resource.isBookmarked
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	const readLabel = resource.isConsumed ? "Mark unread" : "Mark read"
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap items-center justify-between gap-2">
				{canBookmark ? (
					<Button
						variant="ghost"
						className="px-0"
						accessibilityLabel={bookmarkLabel}
						accessibilityState={{ selected: resource.isBookmarked }}
						disabled={isPending}
						onPress={() => topicFeedHandlers.bookmarkTopicFinding(resource.findingId, !resource.isBookmarked)}
					>
						<Icon as={Bookmark} {...toActiveIconProps(resource.isBookmarked, "size-4")} />
						<ButtonText>{bookmarkLabel}</ButtonText>
					</Button>
				) : null}
				<Button
					variant="ghost"
					className="ml-auto px-0"
					accessibilityLabel={readLabel}
					accessibilityState={{ selected: resource.isConsumed }}
					disabled={isPending}
					onPress={() => topicFeedHandlers.consumeTopicFinding(resource.findingId, !resource.isConsumed)}
				>
					<Icon as={resource.isConsumed ? Circle : Check} />
					<ButtonText>{readLabel}</ButtonText>
				</Button>
			</View>
			{isPending ? (
				<Text accessibilityLiveRegion="polite" style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					Saving…
				</Text>
			) : null}
		</View>
	)
}
