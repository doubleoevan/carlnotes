import {
	type PodcastEpisodeSeekBarElements,
	type PodcastEpisodeSeekBarProps,
	PodcastEpisodeSeekBar as SharedPodcastEpisodeSeekBar,
} from "@carlnotes/core/components/PodcastEpisodeSeekBar"

const elements: PodcastEpisodeSeekBarElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
	Segment: ({ weight, percent }) => (
		<div aria-hidden="true" className="bg-muted h-1.5 overflow-hidden rounded-full" style={{ flex: `${weight} 1 0` }}>
			<div className="bg-primary h-full" style={{ width: `${percent}%` }} />
		</div>
	),
	Track: ({ children, positionSeconds, durationSeconds, onSeek }) => (
		<div className="relative flex flex-1 gap-1">
			{children}
			<input
				type="range"
				aria-label="Seek"
				min={0}
				max={durationSeconds}
				value={positionSeconds}
				onChange={(event) => onSeek(Number(event.target.value))}
				className="absolute inset-x-0 -inset-y-3 cursor-pointer opacity-0"
			/>
		</div>
	),
}

/**
 * Adapts the shared segmented bar to a keyboard-accessible browser range input.
 */
export function PodcastEpisodeSeekBar(props: PodcastEpisodeSeekBarProps) {
	return <SharedPodcastEpisodeSeekBar {...props} elements={elements} />
}
