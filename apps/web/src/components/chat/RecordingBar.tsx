import { toClockLabel } from "@carlnotes/core/lib/labels"
import { ArrowUp, X } from "lucide-react"
import { ICON_BUTTON_CLASS, SEND_BUTTON_CLASS } from "@/lib/styleClasses"
import type { VoiceRecording } from "./useVoiceRecording"

/**
 * The recording bar that replaces the composer's box while a recording runs: cancel, the level meter, the timer,
 * and send. The recording sends itself once the speaker stops, and send sends it early.
 */
export function RecordingBar({ voiceRecording }: { voiceRecording: VoiceRecording }) {
	const meterPercent = Math.round(voiceRecording.level * 100)
	return (
		<div className="flex items-center gap-2">
			<button type="button" aria-label="Cancel" onClick={voiceRecording.cancel} className={ICON_BUTTON_CLASS}>
				<X className="size-4" />
			</button>
			{/* the level meter fills with the microphone's level. the timer is the bar's word for a screen reader */}
			<div aria-hidden="true" className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
				<div
					className="bg-primary h-full rounded-full transition-[width] duration-75"
					style={{ width: `${meterPercent}%` }}
				/>
			</div>
			{/* the timer, in minutes and seconds */}
			<span className="text-muted-foreground w-10 shrink-0 text-right text-sm tabular-nums">
				{toClockLabel(voiceRecording.secondsElapsed)}
			</span>
			<button type="button" aria-label="Send" onClick={voiceRecording.send} className={SEND_BUTTON_CLASS}>
				<ArrowUp className="size-4" />
			</button>
		</div>
	)
}
