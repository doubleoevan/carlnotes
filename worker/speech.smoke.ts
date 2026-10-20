// a live smoke test of speech and transcription. record a podcast clip on each Gemini tier, speak a sentence in each
// host's voice as an MP3 and transcribe it back as a browser's recording, and check the key's spend against the app's
// own speech rates. a transcription charges nothing on the key, so the run prints its estimate and tokens alone
// run it with: bun run smoke:speech. it needs the proxy from bun run carl-up, with GEMINI_API_KEY on the proxy

import type { PodcastEpisodeSpeaker } from "@shared/enums"
import type { PodcastEpisodeTurn } from "@shared/payloads"
import { podcastEpisodeSpeechModel } from "@shared/podcastEpisodes"
import { type SpeechTier, speechCost, transcriptionCost } from "./budget"
import { runFfmpeg } from "./ffmpeg"
import { deleteLiteLLMKey, provisionLiteLLMKey, readLiteLLMKeySpend } from "./litellm"
import { recordSpeech, recordSpokenAnswer, SPOKEN_ANSWER_SPEECH_TIER } from "./speech"
import { transcodeRecording, transcribeRecording } from "./transcription"

// a short exchange between the host and the cohost, with one inline tag and one style
const CLIP_TURNS: PodcastEpisodeTurn[] = [
	{ speaker: "host", text: "Three reviews landed this week, and one of them matters." },
	{ speaker: "cohost", text: "Okay, <laugh> so which one, and why do I care?", style: "curious and warm" },
	{ speaker: "host", text: "The one that names the stockists. That is where you can buy it." },
]

// the sentence that the spoken answer says, and a word of it that the transcript has to include
const SPOKEN_ANSWER_TEXT = "The stockists are listed on the review page, and the first one ships this week."
const SPOKEN_ANSWER_WORD = "stockists"

// the test key's budget in cents, far above what the clips cost
const TEST_KEY_BUDGET_CENTS = 100

// how long to wait for the proxy to write a call's spend, and how often to read the spend.
// the write takes a few seconds
const SPEND_WAIT_MS = 90_000
const SPEND_POLL_MS = 3000

// how far the proxy's spend may differ from the app's estimate and still count as the same rate
const SPEND_TOLERANCE_SHARE = 0.1

// one clip's spend. whether it was recorded, what the app estimates that it cost, and what the proxy charged the key
type ClipSpend = { isRecorded: boolean; estimatedDollars: number; chargedDollars: number }

// a clip that failed before it spent
const FAILED_CLIP_SPEND: ClipSpend = { isRecorded: false, estimatedDollars: 0, chargedDollars: 0 }

// a spoken answer's clip. the speech call's spend, whether the audio is an MP3, and the audio
type SpokenAnswerClip = ClipSpend & { isMp3: boolean; audioBytes: Uint8Array }

// a spoken answer clip that failed before it spent
const FAILED_SPOKEN_ANSWER_CLIP: SpokenAnswerClip = { ...FAILED_CLIP_SPEND, isMp3: false, audioBytes: new Uint8Array() }

// a spoken answer transcribed back. the speech call's spend, whether the audio is an MP3, and whether the transcript
// has the spoken word
type VoiceClip = Omit<SpokenAnswerClip, "audioBytes"> & { isTranscribed: boolean }

// a voice clip that failed before it spent
const FAILED_VOICE_CLIP: VoiceClip = { ...FAILED_CLIP_SPEND, isMp3: false, isTranscribed: false }

// how wide a label is in the printed report, before its colon. the longest label is "co-host answer estimated $"
const REPORT_LABEL_WIDTH = 26

// the arguments that encode the spoken answer as Chrome records: opus in webm
const CHROME_RECORDING_ARGUMENTS = ["-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k", "-f", "webm", "pipe:1"]

// record the clip on one tier with the test key, wait for the key's spend, and return the estimate and the charge
async function recordTierClip(speechTier: SpeechTier, testKey: string): Promise<ClipSpend> {
	// read the key's spend, record the clip, and return a failed clip if the call recorded no audio
	const spendBeforeDollars = (await readLiteLLMKeySpend(testKey)) ?? 0
	const recordSpeechResult = await recordSpeech({ turns: CLIP_TURNS, speechTier, litellmApiKey: testKey })
	if (recordSpeechResult.outcome !== "recorded") {
		printReportLine({ label: `${speechTier} clip failed`, value: JSON.stringify(recordSpeechResult) })
		return FAILED_CLIP_SPEND
	}

	// estimate the call's cost from the response's token counts, and print the clip's size and tokens
	const { inputTokens, audioTokens, audioBytes } = recordSpeechResult
	const estimatedDollars = speechCost({ speechTier, inputTokens, audioTokens })
	printReportLine({
		label: `${speechTier} clip`,
		value: `${audioBytes.length} bytes, ${inputTokens} in, ${audioTokens} audio tokens`,
	})

	// wait for the proxy to write the call's spend on the key, and print the estimate and the charge
	const chargedDollars = await waitForChargedDollars(testKey, spendBeforeDollars)
	const clipSpend = { isRecorded: true, estimatedDollars, chargedDollars }
	printClipSpend(speechTier, clipSpend)
	return clipSpend
}

// the test key, the host whose voice speaks the sentence, and the clip's name in the printed report
type RecordSpokenAnswerClipOptions = { testKey: string; speaker: PodcastEpisodeSpeaker; clipName: string }

// speak the sentence in one host's voice on the test key, print the clip's size, type, and tokens, wait for the speech
// call's spend, and return the spend, whether the audio is an MP3, and the audio
async function recordSpokenAnswerClip({
	testKey,
	speaker,
	clipName,
}: RecordSpokenAnswerClipOptions): Promise<SpokenAnswerClip> {
	// read the key's spend, speak the sentence, and return a failed clip if the call recorded no audio
	const spendBeforeDollars = (await readLiteLLMKeySpend(testKey)) ?? 0
	const recordSpokenAnswerResult = await recordSpokenAnswer({
		text: SPOKEN_ANSWER_TEXT,
		speaker,
		litellmApiKey: testKey,
	})
	if (recordSpokenAnswerResult.outcome !== "recorded") {
		printReportLine({ label: `${clipName} failed`, value: JSON.stringify(recordSpokenAnswerResult) })
		return FAILED_SPOKEN_ANSWER_CLIP
	}

	// estimate the speech call's cost, print the clip's size, type, and tokens, and wait for the call's spend
	const { inputTokens, audioTokens, audioBytes, audioContentType } = recordSpokenAnswerResult
	const estimatedDollars = speechCost({ speechTier: SPOKEN_ANSWER_SPEECH_TIER, inputTokens, audioTokens })
	printReportLine({
		label: clipName,
		value: `${audioBytes.length} bytes ${audioContentType}, ${inputTokens} in, ${audioTokens} audio tokens`,
	})
	const chargedDollars = await waitForChargedDollars(testKey, spendBeforeDollars)
	const spokenAnswerClip = { isRecorded: true, isMp3: isMp3(audioBytes), estimatedDollars, chargedDollars, audioBytes }
	printClipSpend(clipName, spokenAnswerClip)
	return spokenAnswerClip
}

// speak the sentence in Carl's voice on the test key, wait for the speech call's spend, then encode the MP3 as Chrome's
// recording, transcode it, and transcribe it on the same key
async function recordVoiceClip(testKey: string): Promise<VoiceClip> {
	// speak the sentence in Carl's voice, and return a failed clip if the call recorded no audio
	const { audioBytes, ...speechClip } = await recordSpokenAnswerClip({
		testKey,
		speaker: "host",
		clipName: "spoken answer",
	})
	if (!speechClip.isRecorded) {
		return FAILED_VOICE_CLIP
	}

	// encode the MP3 as Chrome's recording, then transcode and transcribe it on the same key
	const recordingBytes = await runFfmpeg({ ffmpegArguments: CHROME_RECORDING_ARGUMENTS, inputBytes: audioBytes })
	const transcodedBytes = await transcodeRecording(recordingBytes)
	const transcribeRecordingResult = await transcribeRecording({ audioBytes: transcodedBytes, litellmApiKey: testKey })
	if (transcribeRecordingResult.outcome !== "transcribed") {
		printReportLine({ label: "transcription failed", value: JSON.stringify(transcribeRecordingResult) })
		return { ...speechClip, isTranscribed: false }
	}

	// print the transcript, its tokens, and its estimate, which the key is not charged
	const { transcript } = transcribeRecordingResult
	printReportLine({ label: "transcript", value: transcript })
	printReportLine({
		label: "transcription",
		value: `${transcribeRecordingResult.inputTokens} in, ${transcribeRecordingResult.outputTokens} out tokens`,
	})
	printReportLine({ label: "transcription est. $", value: transcriptionCost(transcribeRecordingResult).toFixed(6) })
	return { ...speechClip, isTranscribed: transcript.toLowerCase().includes(SPOKEN_ANSWER_WORD) }
}

// whether the audio is an MP3: an ID3 tag or an MPEG frame sync at the start
function isMp3(audioBytes: Uint8Array): boolean {
	const isId3 = new TextDecoder().decode(audioBytes.subarray(0, 3)) === "ID3"
	const isFrameSync = audioBytes[0] === 0xff && ((audioBytes[1] ?? 0) & 0xe0) === 0xe0
	return isId3 || isFrameSync
}

// wait for the proxy to write a call's spend on the key, and return how much the key's spend rose from the spend before
async function waitForChargedDollars(testKey: string, spendBeforeDollars: number): Promise<number> {
	let chargedDollars = 0
	for (let waitedMs = 0; waitedMs < SPEND_WAIT_MS && chargedDollars <= 0; waitedMs += SPEND_POLL_MS) {
		await Bun.sleep(SPEND_POLL_MS)
		chargedDollars = ((await readLiteLLMKeySpend(testKey)) ?? 0) - spendBeforeDollars
	}
	return chargedDollars
}

// print a clip's estimate and charge, so a mismatch shows which rate the proxy applied
function printClipSpend(clipName: string, { estimatedDollars, chargedDollars }: ClipSpend): void {
	printReportLine({ label: `${clipName} estimated $`, value: estimatedDollars.toFixed(6) })
	printReportLine({ label: `${clipName} charged $`, value: chargedDollars.toFixed(6) })
}

// a report line's label, and the value printed after its colon
type PrintReportLineOptions = { label: string; value: string }

// print one report line, with its label padded so that every colon in the report lines up
function printReportLine({ label, value }: PrintReportLineOptions): void {
	console.log(`${label.padEnd(REPORT_LABEL_WIDTH)}: ${value}`)
}

// whether the proxy charged the key what the app estimates, within the tolerance
function isChargedAtRate({ estimatedDollars, chargedDollars }: ClipSpend): boolean {
	return estimatedDollars > 0 && Math.abs(chargedDollars - estimatedDollars) <= estimatedDollars * SPEND_TOLERANCE_SHARE
}

// record the clip on the standard tier and the flex tier, then the voice clip and the co-host's, with a fresh test key,
// check each clip, and print the report
async function smokeTest(): Promise<boolean> {
	// a deployment with the speech model set empty has no speech to test
	if (!podcastEpisodeSpeechModel()) {
		console.log("PODCAST_SPEECH_MODEL is set empty, so podcast speech is off and there is nothing to test")
		return true
	}

	// provision a key for this run alone, so the spend that the run reads is its own
	const testKey = await provisionLiteLLMKey(`speech-smoke-${Date.now()}@example.com`, TEST_KEY_BUDGET_CENTS)
	try {
		// record the clip on each tier and the voice clip with the test key
		const standardClip = await recordTierClip("standard", testKey)
		const flexClip = await recordTierClip("flex", testKey)
		const voiceClip = await recordVoiceClip(testKey)
		const cohostClip = await recordSpokenAnswerClip({ testKey, speaker: "cohost", clipName: "co-host answer" })

		// the smoke test assertions. each clip's spend on the key has to match the app's own rates for it
		const checks: [string, boolean][] = [
			["the standard clip was recorded", standardClip.isRecorded],
			["the flex clip was recorded", flexClip.isRecorded],
			["the standard spend reached the key at the standard rate", isChargedAtRate(standardClip)],
			["the flex spend reached the key at the app's flex rate", isChargedAtRate(flexClip)],
			["the spoken answer is an MP3", voiceClip.isMp3],
			["the spoken answer's spend reached the key at the standard rate", isChargedAtRate(voiceClip)],
			["the spoken answer was transcribed with the word spoken", voiceClip.isTranscribed],
			["the co-host's spoken answer is an MP3", cohostClip.isRecorded && cohostClip.isMp3],
			["the co-host's spoken answer's spend reached the key at the standard rate", isChargedAtRate(cohostClip)],
		]

		// print each check and return the overall result
		let isEveryCheckPassing = true
		for (const [label, isCheckPassing] of checks) {
			console.log(`${isCheckPassing ? "PASS" : "FAIL"}  ${label}`)
			isEveryCheckPassing = isEveryCheckPassing && isCheckPassing
		}
		return isEveryCheckPassing
	} finally {
		// delete the test key, no matter how the run ends
		await deleteLiteLLMKey(testKey)
	}
}

// run the smoke test and set the exit code from its result
smokeTest()
	.then((isEveryCheckPassing) => {
		console.log(isEveryCheckPassing ? "\n=== smoke PASSED ===" : "\n=== smoke FAILED ===")
		process.exitCode = isEveryCheckPassing ? 0 : 1
	})
	.catch((error) => {
		// a crash fails the run
		console.error("smoke test crashed:", error)
		process.exitCode = 1
	})
