// the fake expo-audio player that the audio adapters' tests drive: every call a mock, and the statuses that the test
// sends
import { mock } from "bun:test"
import type { AudioPlayer, AudioStatus } from "expo-audio"

/**
 * Returns a fake expo-audio player whose calls are mocks, and the call that sends a status to its listeners over a
 * loaded status playing at 40 seconds.
 */
export function toAudioPlayerFixture(): { player: AudioPlayer; emit: (status: Partial<AudioStatus>) => void } {
	// the player's listeners, which each status reaches
	const listeners = new Set<(status: AudioStatus) => void>()
	const player = {
		isLoaded: true,
		replace: mock(() => {}),
		play: mock(() => {}),
		pause: mock(() => {}),
		seekTo: mock(async () => {}),
		setPlaybackRate: mock(() => {}),
		setChapterTargets: mock(() => {}),
		setActiveForLockScreen: mock(() => {}),
		clearLockScreenControls: mock(() => {}),
		addListener: mock((_name: string, listener: (status: AudioStatus) => void) => {
			listeners.add(listener)
			return { remove: () => listeners.delete(listener) }
		}),
	} as unknown as AudioPlayer

	// send a status over the playing defaults
	const emit = (status: Partial<AudioStatus>): void => {
		for (const listener of listeners) {
			listener({ currentTime: 40, playing: true, isBuffering: false, isLoaded: true, ...status } as AudioStatus)
		}
	}
	return { player, emit }
}
