import type { PodcastEpisodeTranscriptBlock } from "@carlnotes/contracts/podcast"
import { type ComponentType, type ReactNode, useState } from "react"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PodcastEpisodeTranscriptElements = {
	Card: ComponentType<{ children: ReactNode; isExpanded: boolean }>
	Group: Container
	Text: Container
	Strong: Container
	Heading: Container
	Divider: ComponentType
	More: ComponentType<{ isExpanded: boolean; onToggle: () => void; moreLabel: string; lessLabel: string }>
}

/**
 * Composes the expandable transcript with speaker labels and chapter dividers for both apps.
 */
export function PodcastEpisodeTranscript({
	transcript,
	elements: { Card, Group, Text, Strong, Heading, Divider, More },
}: {
	transcript: PodcastEpisodeTranscriptBlock[]
	elements: PodcastEpisodeTranscriptElements
}) {
	// keep transcript expansion independent of playback and navigation
	const [isExpanded, setIsExpanded] = useState(false)
	return (
		<>
			{/* speaker turns and chapter boundaries */}
			<Card isExpanded={isExpanded}>
				{transcript.map((block, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: transcript blocks never reorder
					<Group key={index} className="mb-4 last:mb-0">
						{block.heading ? (
							<Heading className="mb-2 text-center font-bold">{block.heading}</Heading>
						) : index > 0 ? (
							<Divider />
						) : null}
						{block.turns.map((turn, turnIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: transcript turns never reorder
							<Text key={turnIndex} className="mb-1.5 leading-relaxed">
								<Strong className="font-semibold">{`${turn.speakerName}: `}</Strong>
								{turn.text}
							</Text>
						))}
					</Group>
				))}
			</Card>
			{/* expand the bounded transcript reader */}
			<More
				isExpanded={isExpanded}
				onToggle={() => setIsExpanded(!isExpanded)}
				moreLabel="read more "
				lessLabel="read less "
			/>
		</>
	)
}
