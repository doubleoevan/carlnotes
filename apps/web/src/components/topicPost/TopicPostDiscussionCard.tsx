// the web's discussion card on a Topic Post's page: the shared card in a page card, with the podcast play button, the
// account forms' input and buttons, and the transcript that the card's name opens and closes
import {
	TopicPostDiscussionCard as SharedTopicPostDiscussionCard,
	type TopicPostDiscussionCardElements,
	type TopicPostDiscussionCardProps,
} from "@carlnotes/core/components/TopicPostDiscussionCard"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronRight, RefreshCw } from "lucide-react"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { PODCAST_EPISODE_TRANSCRIPT_ELEMENTS } from "@/components/podcast/PodcastEpisodeTranscript"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { CARD_CLASS, EXPANDER_CARET_CLASS } from "@/lib/styleClasses"

// the name's classes, with and without the caret
const TITLE_CLASS = "font-display text-lg leading-tight"

// the web's elements. the name leads at the left, and Regenerate, with the image editor's icon, sits at the right of
// the row. the transcript stays in the page, closed, and the name's details element opens it with and without
// JavaScript, so the elements read no open state
export const TOPIC_POST_DISCUSSION_CARD_ELEMENTS: TopicPostDiscussionCardElements = {
	Card: ({ children }) => <section className={`${CARD_CLASS} group/discussion mt-4`}>{children}</section>,
	// on a narrow screen Regenerate wraps under the name, at the right, so the name keeps one line
	Row: ({ children }) => <div className="flex flex-wrap items-center gap-3">{children}</div>,
	PlayButton: ({ podcastEpisode }) => <PodcastEpisodePlayButton podcastEpisode={podcastEpisode} size="default" />,
	Details: ({ title, detailsText, transcriptToggle }) => (
		<div className="min-w-0 grow basis-52">
			{transcriptToggle ? (
				// the name behind the caret that the news card's title opens and closes with
				<details className="group/transcript">
					<summary className="focus-visible:ring-ring/50 w-fit cursor-pointer list-none rounded-md outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
						<h2 className={cn(TITLE_CLASS, "flex items-center gap-2")}>
							<ChevronRight className={cn(EXPANDER_CARET_CLASS, "group-open/transcript:rotate-90")} />
							{title}
						</h2>
					</summary>
				</details>
			) : (
				<h2 className={TITLE_CLASS}>{title}</h2>
			)}
			{detailsText && <p className="text-muted-foreground text-sm">{detailsText}</p>}
		</div>
	),
	// shown once the name's details element is open
	Transcript: ({ children }) => (
		<div className="mt-4 hidden group-has-[details[open]]/discussion:block">{children}</div>
	),
	transcriptTurnElements: PODCAST_EPISODE_TRANSCRIPT_ELEMENTS,
	Action: ({ label, onPress }) => (
		<Button type="button" variant="outline" size="sm" onClick={onPress} className="ml-auto">
			<RefreshCw className="size-4" />
			{label}
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
		<form
			className="mt-3 space-y-3"
			onSubmit={(event) => {
				// start the recording without navigating
				event.preventDefault()
				onSubmit()
			}}
		>
			{/* the field names itself from inside, so the card's name is the only line above it */}
			<Input
				aria-label={hintLabel}
				className="bg-card"
				value={hint}
				placeholder={hintLabel}
				maxLength={hintMaxChars}
				onChange={(event) => onHintChange(event.target.value)}
			/>
			{/* the plain Cancel at the left, the highlighted Regenerate at the right, and the month's count after them */}
			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					{cancelLabel}
				</Button>
				<Button type="submit" disabled={isSending}>
					<RefreshCw className="size-4" />
					{submitLabel}
				</Button>
				<p className="text-muted-foreground text-sm">{countLabel}</p>
			</div>
		</form>
	),
}

/**
 * A Topic Post's discussion card with the web's elements.
 */
export function TopicPostDiscussionCard(props: TopicPostDiscussionCardProps) {
	return <SharedTopicPostDiscussionCard {...props} elements={TOPIC_POST_DISCUSSION_CARD_ELEMENTS} />
}
