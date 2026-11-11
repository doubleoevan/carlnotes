// a Topic Post's discussion on its page: the play button of the shared podcast player beside the discussion's name
// and its line, the transcript that the name opens and closes, and, for whoever may record it, Regenerate with a note
// for the hosts
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import {
	TOPIC_POST_DISCUSSION_HINT_MAX_CHARS,
	type TopicPostResponse,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import { type ComponentType, type PropsWithChildren, useState } from "react"
import { useTopicPostDiscussion } from "../hooks/useTopicPostDiscussion"
import { toRegenerationCountLabel } from "../lib/topicImageEditor"
import {
	isDiscussionRegenerateShown,
	isTopicPostDiscussionShown,
	TOPIC_POST_DISCUSSION_LABELS,
	toTopicPostDiscussionDetailsText,
	toTopicPostDiscussionTranscript,
} from "../lib/topicPostDiscussions"
import {
	type PodcastEpisodeTranscriptTurnElements,
	PodcastEpisodeTranscriptTurns,
} from "./PodcastEpisodeTranscriptTurns"

// the regenerate form as each app draws it: the note's field, which its label names from inside, the month's count,
// and its two buttons
type TopicPostDiscussionFormProps = {
	hint: string
	hintLabel: string
	hintMaxChars: number
	onHintChange: (hint: string) => void
	countLabel: string
	submitLabel: string
	cancelLabel: string
	isSending: boolean
	onSubmit: () => void
	onCancel: () => void
}

// whether the transcript shows, and the press on the discussion's name that opens and closes it
type TopicPostDiscussionTranscriptToggle = { isExpanded: boolean; onToggle: () => void }

// each app's elements: the card, the row of the play button, the name, and the action, the play button of the shared
// player, the name over its line, which the open form leaves out, the button that opens the form, the form, the box of
// the transcript, and a transcript's line. the name opens and closes the transcript of a discussion that has one
export type TopicPostDiscussionCardElements = {
	Card: ComponentType<PropsWithChildren>
	Row: ComponentType<PropsWithChildren>
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisode }>
	Details: ComponentType<{
		title: string
		detailsText: string | null
		transcriptToggle: TopicPostDiscussionTranscriptToggle | null
	}>
	Action: ComponentType<{ label: string; onPress: () => void }>
	Form: ComponentType<TopicPostDiscussionFormProps>
	Transcript: ComponentType<PropsWithChildren<{ isExpanded: boolean }>>
	transcriptTurnElements: PodcastEpisodeTranscriptTurnElements
}

// the post, the read of it again after a recording starts or ends, and the regenerate request a story replaces
export type TopicPostDiscussionCardProps = {
	topicPost: TopicPostResponse
	onChanged: () => void
	sendRegeneration?: Parameters<typeof useTopicPostDiscussion>[0]["sendRegeneration"]
}

/**
 * Shows a Topic Post's discussion: a recording plays in the shared podcast player, one on its way says so, and
 * whoever may publish on the post's Topic can record it again with a note. The name of a recording that plays opens
 * and closes its transcript, which starts closed. A post with no discussion shows nothing to a reader who may not
 * record one.
 */
export function TopicPostDiscussionCard({
	topicPost,
	onChanged,
	sendRegeneration,
	elements: { Card, Row, PlayButton, Details, Action, Form, Transcript, transcriptTurnElements },
}: TopicPostDiscussionCardProps & { elements: TopicPostDiscussionCardElements }) {
	const discussion = useTopicPostDiscussion({ topicPost, onChanged, sendRegeneration })
	// the transcript starts closed on every visit
	const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false)
	if (!isTopicPostDiscussionShown(topicPost)) {
		return null
	}
	const podcastEpisode = toTopicPostDiscussionPodcastEpisode(topicPost)
	const quota = topicPost.discussionRegenerationQuota
	const transcript = toTopicPostDiscussionTranscript(topicPost)
	return (
		<Card>
			{/* the play button, the name over its line, and the button that opens the form. the open form shows the name
			    alone above its field, and the name opens and closes the transcript */}
			<Row>
				{podcastEpisode && <PlayButton podcastEpisode={podcastEpisode} />}
				<Details
					title={TOPIC_POST_DISCUSSION_LABELS.title}
					detailsText={discussion.isFormOpen ? null : toTopicPostDiscussionDetailsText(topicPost)}
					transcriptToggle={
						transcript && {
							isExpanded: isTranscriptExpanded,
							onToggle: () => setIsTranscriptExpanded((isExpanded) => !isExpanded),
						}
					}
				/>
				{isDiscussionRegenerateShown(topicPost) && !discussion.isFormOpen && (
					<Action label={TOPIC_POST_DISCUSSION_LABELS.regenerate} onPress={discussion.openForm} />
				)}
			</Row>
			{/* the note for the hosts, with the month's count */}
			{discussion.isFormOpen && quota && (
				<Form
					hint={discussion.hint}
					hintLabel={TOPIC_POST_DISCUSSION_LABELS.hintLabel}
					hintMaxChars={TOPIC_POST_DISCUSSION_HINT_MAX_CHARS}
					onHintChange={discussion.setHint}
					countLabel={toRegenerationCountLabel(quota)}
					submitLabel={
						discussion.isSending ? TOPIC_POST_DISCUSSION_LABELS.regenerating : TOPIC_POST_DISCUSSION_LABELS.regenerate
					}
					cancelLabel={TOPIC_POST_DISCUSSION_LABELS.cancel}
					isSending={discussion.isSending}
					onSubmit={() => void discussion.regenerate()}
					onCancel={discussion.closeForm}
				/>
			)}
			{/* the recording's transcript, each turn after its speaker's name */}
			{transcript && (
				<Transcript isExpanded={isTranscriptExpanded}>
					<PodcastEpisodeTranscriptTurns turns={transcript} elements={transcriptTurnElements} />
				</Transcript>
			)}
		</Card>
	)
}
