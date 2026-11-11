// the app's discussion card on a Topic Post's screen: the shared card on a card, with the podcast play button, the
// session forms' text field, and the transcript that the card's name opens and closes
import {
	TopicPostDiscussionCard as SharedTopicPostDiscussionCard,
	type TopicPostDiscussionCardElements,
	type TopicPostDiscussionCardProps,
} from "@carlnotes/core/components/TopicPostDiscussionCard"
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { PODCAST_EPISODE_TRANSCRIPT_ELEMENTS } from "@/components/podcast/PodcastEpisodeTranscript"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"

// the name's classes, with and without the caret
const TITLE_CLASS = "font-display text-lg leading-tight"

// the height the name's line draws at, which its hit slop grows to the touch target
const TITLE_LINE_HEIGHT = 22

// the app's elements, as the web's at phone width: the name leads at the left, and Regenerate, with the image
// editor's icon, sits at the right. the name of a discussion with a transcript is the button that opens and closes it,
// behind the caret that the news card's title opens and closes with
export const TOPIC_POST_DISCUSSION_CARD_ELEMENTS: TopicPostDiscussionCardElements = {
	Card: ({ children }) => (
		<View className="mt-3 rounded-lg border border-border bg-card p-4 shadow-raised">{children}</View>
	),
	// on a narrow screen Regenerate wraps under the name, at the right, so the name keeps one line
	Row: ({ children }) => <View className="flex-row flex-wrap items-center gap-3">{children}</View>,
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
	Details: ({ title, detailsText, transcriptToggle }) => (
		<View className="min-w-52 flex-1">
			{transcriptToggle ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={title}
					accessibilityState={{ expanded: transcriptToggle.isExpanded }}
					hitSlop={toTouchTargetHitSlop(TITLE_LINE_HEIGHT)}
					onPress={transcriptToggle.onToggle}
					className="flex-row items-center gap-2 self-start active:opacity-75"
				>
					<Icon as={transcriptToggle.isExpanded ? ChevronDown : ChevronRight} />
					<Text className={`shrink ${TITLE_CLASS}`}>{title}</Text>
				</Pressable>
			) : (
				<Text accessibilityRole="header" className={TITLE_CLASS}>
					{title}
				</Text>
			)}
			{detailsText && <Text className="text-sm text-muted-foreground">{detailsText}</Text>}
		</View>
	),
	// the transcript's lines under the row, only while open
	Transcript: ({ isExpanded, children }) => (isExpanded ? <View className="mt-4">{children}</View> : null),
	transcriptTurnElements: PODCAST_EPISODE_TRANSCRIPT_ELEMENTS,
	Action: ({ label, onPress }) => (
		<Button accessibilityLabel={label} variant="outline" size="sm" onPress={onPress} className="ml-auto">
			<Icon as={RefreshCw} className="size-4" />
			<Text>{label}</Text>
		</Button>
	),
	Form: ({
		hint,
		hintLabel,
		hintMaxChars,
		onHintChange,
		countLabel,
		submitLabel,
		cancelLabel,
		isSending,
		onSubmit,
		onCancel,
	}) => (
		<View className="mt-3 gap-3">
			{/* the field names itself from inside, so the card's name is the only line above it */}
			<SessionTextInput
				label={hintLabel}
				isLabelVisible={false}
				value={hint}
				placeholder={hintLabel}
				maxLength={hintMaxChars}
				onChangeText={onHintChange}
				autoCapitalize="sentences"
				autoCorrect
			/>
			{/* the plain Cancel at the left, the highlighted Regenerate at the right, and the month's count after them */}
			<View className="flex-row flex-wrap items-center gap-2">
				<Button accessibilityLabel={cancelLabel} variant="outline" onPress={onCancel}>
					<Text>{cancelLabel}</Text>
				</Button>
				<Button accessibilityLabel={submitLabel} disabled={isSending} onPress={onSubmit}>
					<Icon as={RefreshCw} className="size-4" />
					<Text>{submitLabel}</Text>
				</Button>
				<Text className="text-sm text-muted-foreground">{countLabel}</Text>
			</View>
		</View>
	),
}

/**
 * A Topic Post's discussion card with the app's elements.
 */
export function TopicPostDiscussionCard(props: TopicPostDiscussionCardProps) {
	return <SharedTopicPostDiscussionCard {...props} elements={TOPIC_POST_DISCUSSION_CARD_ELEMENTS} />
}
