import { authClient } from "@carlnotes/client/authClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import {
	TopicPostInfo as SharedTopicPostInfo,
	type TopicPostInfoElements,
	type TopicPostInfoProps,
} from "@carlnotes/core/components/TopicPostInfo"
import { toTopicPostShare } from "@carlnotes/core/lib/topicPosts"
import { NotebookPen } from "lucide-react-native"
import type { ComponentProps } from "react"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIconButton } from "@/components/branding/NoteIconButton"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DetailsLine } from "@/components/common/DetailsLine"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Sheet } from "@/components/common/Sheet"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { ShareTopic } from "@/components/share/ShareTopic"
import { ReactionRow } from "@/components/social/ReactionRow"
import { TopicImageLink } from "@/components/topic/TopicImageLink"
import { TopicInfoSection } from "@/components/topic/TopicInfoSection"
import { SHEET_TOPIC_IMAGE_CLASS } from "@/topicImageClasses"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the notebook and pen tile wherever a post offers its popup. it opens a sheet in the popover's place. a phone has no
// anchored popover
function TopicPostInfoFrame({ label, isOpen, onOpenChange, children }: ComponentProps<TopicPostInfoElements["Frame"]>) {
	return (
		<>
			<NoteIconButton label={label} icon={NotebookPen} isOpen={isOpen} onPress={() => onOpenChange(true)} />
			{isOpen ? (
				<Sheet title={label} onClose={() => onOpenChange(false)}>
					{children}
				</Sheet>
			) : null}
		</>
	)
}

// the app's elements, a Topic roast sheet's: the sheet under the note icon, the title, the labeled sections, the
// author's link with the reactions and the Share button that opens the topic's share sheet for the post, the post's
// image at full width, linked to the post's screen, the discussion's play button before its day, length, and hosts,
// the Topic's image beside its linked name, and the summary in the scroll box a Finding's notes sit in, whose copy
// button offers the summary as Markdown
const TOPIC_POST_INFO_ELEMENTS: TopicPostInfoElements = {
	Frame: TopicPostInfoFrame,
	Title: ({ children }) => (
		<Text accessibilityRole="header" style={toTypeRoleStyle("sectionHeading")} className="text-foreground">
			{children}
		</Text>
	),
	Section: TopicInfoSection,
	AuthorRow: ({ share, children }) => (
		<View className="flex-row items-center justify-between gap-3">
			<View className="min-w-0 shrink flex-row flex-wrap items-center gap-x-3">{children}</View>
			{share}
		</View>
	),
	Byline: ({ author }) => <UserProfileLink user={author} />,
	Reactions: ReactionRow,
	ShareButton: ({ topicPost }) => <ShareTopic {...toTopicPostShare(topicPost)} isLabeled />,
	TopicRow: ({ topic, image, details, onOpen }) => (
		<View className="flex-row items-center gap-3">
			{/* the Topic's image, which opens the Topic's screen as the name does */}
			<TopicImageLink
				image={image}
				size="list"
				name={topic.name}
				className="h-12 w-18"
				path={toTopicPath(topic)}
				onOpen={onOpen}
			/>
			{/* the Topic's name, with its viewers and followers on the line under it */}
			<View className="min-w-0 shrink">
				<AnchorLink
					href={toTopicPath(topic)}
					accessibilityLabel={`Open ${topic.name}`}
					onPress={onOpen}
					hitSlop={toTouchTargetHitSlop(44)}
					className="active:opacity-75"
				>
					<Text style={toTypeRoleStyle("label")} className="text-link">
						{topic.name}
					</Text>
				</AnchorLink>
				<DetailsLine details={details} />
			</View>
		</View>
	),
	// the image is the sheet's one link to the post's screen, with its name for a screen reader
	Image: ({ image, name, path, onOpen }) => (
		<View className="py-3">
			<TopicImageLink
				image={image}
				size="page"
				name={name}
				className={SHEET_TOPIC_IMAGE_CLASS}
				path={path}
				label={`Open ${name}`}
				onOpen={onOpen}
			/>
		</View>
	),
	DiscussionRow: ({ detailsText, children }) => (
		<View className="flex-row items-center gap-3">
			{children}
			<Text className="shrink text-xs text-muted-foreground">{detailsText}</Text>
		</View>
	),
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
	Notes: ({ toCopyMarkdown, children }) => (
		<ScrollBox copyMarkdown={toCopyMarkdown(SITE_URL)}>
			<Text selectable style={toTypeRoleStyle("body")} className="text-popover-foreground">
				{children}
			</Text>
		</ScrollBox>
	),
	Unavailable: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	Loading: () => <CoffeeLoading className="py-16" />,
}

/**
 * A Topic Post's info popup in the app, a sheet under its notebook and pen tile.
 */
export function TopicPostInfo(props: TopicPostInfoProps) {
	const { data: session } = authClient().useSession()
	return <SharedTopicPostInfo {...props} userId={session?.user.id ?? null} elements={TOPIC_POST_INFO_ELEMENTS} />
}
