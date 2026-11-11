// the turns of a transcript, each a line that starts with its speaker's name
import type { PodcastEpisodeTranscriptTurn } from "@carlnotes/contracts/podcast"
import type { ComponentType, ReactNode } from "react"

// each app's line of text, and the bold run that holds the speaker's name
export type PodcastEpisodeTranscriptTurnElements = {
	Text: ComponentType<{ children: ReactNode; className?: string }>
	Strong: ComponentType<{ children: ReactNode; className?: string }>
}

/**
 * Lists a transcript's turns in order, each after its speaker's name, in a podcast episode's transcript and in a Topic
 * Post's discussion.
 */
export function PodcastEpisodeTranscriptTurns({
	turns,
	elements: { Text, Strong },
}: {
	turns: PodcastEpisodeTranscriptTurn[]
	elements: PodcastEpisodeTranscriptTurnElements
}) {
	return turns.map((turn, turnIndex) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: transcript turns never reorder
		<Text key={turnIndex} className="mb-1.5 leading-relaxed">
			<Strong className="font-semibold">{`${turn.speakerName}: `}</Strong>
			{turn.text}
		</Text>
	))
}
