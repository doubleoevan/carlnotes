import { useEffect, useRef } from "react"
import { registerSpokenAnswerAudio } from "@/stores/spokenAnswerStore"

/**
 * The audio element carl's spoken answers play through, which the spoken answer store drives.
 */
export function SpokenAnswerAudio() {
	// register the audio element with the spoken answer store
	const audioRef = useRef<HTMLAudioElement>(null)
	useEffect(() => (audioRef.current ? registerSpokenAnswerAudio(audioRef.current) : undefined), [])
	return (
		// biome-ignore lint/a11y/useMediaCaption: carl's spoken answer is the reply text already on screen
		<audio ref={audioRef} preload="auto" />
	)
}
