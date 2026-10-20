// voice activity detection on the device: the Silero model under @ricky0123/vad-web, which tells speech from background
// noise, deciding when a question asked from the podcast player ends. the module and its files load on the first
// question only, and one detector serves the page
import { MicVAD } from "@ricky0123/vad-web"
import { END_OF_SPEECH_MS } from "@/lib/voiceRecordingDecisions"

// where the build serves the detector's worklet, its model, and its WebAssembly runtime, a folder the vite plugin
// names for both packages' versions
declare const __VOICE_ACTIVITY_ASSET_PATH__: string

// what one question listens for: speech starting, speech ending after the pause, and a blip too short to be speech
export type VoiceActivityHandlers = { onSpeechStart: () => void; onSpeechEnd: () => void; onMisfire: () => void }

// the page's one detector, or null once it failed to start, and the question it is listening to
let voiceActivityDetectorLoad: Promise<MicVAD | null> | null = null
let currentMicrophoneStream: MediaStream | null = null
let currentVoiceActivityHandlers: VoiceActivityHandlers | null = null

// the context the first tap made, the question's microphone stream, and what the question listens for
type StartVoiceActivityOptions = VoiceActivityHandlers & { audioContext: AudioContext; stream: MediaStream }

/**
 * Starts listening to one question's microphone stream and returns its stop, or null if the device cannot run it.
 */
export async function startVoiceActivity({
	audioContext,
	stream,
	...voiceActivityHandlers
}: StartVoiceActivityOptions): Promise<(() => void) | null> {
	// the question's stream and handlers, which the detector reads on start and on each event
	currentMicrophoneStream = stream
	currentVoiceActivityHandlers = voiceActivityHandlers

	// make one detector per page and pause it between questions. a second detector runs out of memory on iOS
	voiceActivityDetectorLoad ??= createVoiceActivityDetector(audioContext)
	const voiceActivityDetector = await voiceActivityDetectorLoad
	if (!voiceActivityDetector || currentMicrophoneStream !== stream) {
		return null
	}

	// listen until the question ends, then pause, which leaves the microphone to the recorder
	await voiceActivityDetector.start()
	return () => {
		currentVoiceActivityHandlers = null
		currentMicrophoneStream = null
		void voiceActivityDetector.pause()
	}
}

// make the page's detector over the question's stream, or null if the device cannot run it
async function createVoiceActivityDetector(audioContext: AudioContext): Promise<MicVAD | null> {
	try {
		return await MicVAD.new({
			model: "v5",
			// the chat mic's pause without speech, once speech started, ends the question
			redemptionMs: END_OF_SPEECH_MS,
			baseAssetPath: __VOICE_ACTIVITY_ASSET_PATH__,
			onnxWASMBasePath: __VOICE_ACTIVITY_ASSET_PATH__,
			audioContext,
			startOnLoad: false,
			// the recorder owns the microphone. the detector reads the question's stream and never stops or reopens it
			getStream: async () => currentMicrophoneStream ?? new MediaStream(),
			resumeStream: async () => currentMicrophoneStream ?? new MediaStream(),
			pauseStream: async () => {},
			onSpeechStart: () => currentVoiceActivityHandlers?.onSpeechStart(),
			onSpeechEnd: () => currentVoiceActivityHandlers?.onSpeechEnd(),
			onVADMisfire: () => currentVoiceActivityHandlers?.onMisfire(),
		})
	} catch (error) {
		// an old device without SIMD, or iOS out of memory, keeps the level-based end of speech for the page
		console.error("voice activity detection could not start", error)
		return null
	}
}
