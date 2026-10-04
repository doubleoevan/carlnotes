// a live smoke test of podcast speech. render a clip on each Gemini tier, and check the key's spend at each tier's rate
// run it with: bun run smoke:speech. it needs the proxy from bun run carl-up, with GEMINI_API_KEY on the proxy
import type { PodcastEpisodeTurn } from "@shared/contracts"
import { podcastEpisodeSpeechModel } from "@shared/podcastEpisodes"
import { type SpeechTier, speechCost } from "./budget"
import { deleteLiteLLMKey, provisionLiteLLMKey, readLiteLLMKeySpend } from "./litellm"
import { renderSpeech } from "./speech"

// a short exchange between the host and the cohost, with one inline tag and one style
const CLIP_TURNS: PodcastEpisodeTurn[] = [
	{ speaker: "host", text: "Three reviews landed this week, and one of them matters." },
	{ speaker: "cohost", text: "Okay, <laugh> so which one, and why do I care?", style: "curious and warm" },
	{ speaker: "host", text: "The one that names the stockists. That is where you can buy it." },
]

// the test key's budget in cents, far above what two short clips cost
const TEST_KEY_BUDGET_CENTS = 100

// how long to wait for the proxy to write a call's spend, and how often to read the spend.
// the write takes a few seconds
const SPEND_WAIT_MS = 90_000
const SPEND_POLL_MS = 3000

// how far the proxy's spend may differ from the app's estimate and still count as the same rate
const SPEND_TOLERANCE_SHARE = 0.1

// one tier's clip. whether it rendered, what the app estimates that it cost, and what the proxy charged the key
type TierClip = { speechTier: SpeechTier; isRendered: boolean; estimatedDollars: number; chargedDollars: number }

// render the clip on one tier with the test key, wait for the key's spend, and return the estimate and the charge
async function renderTierClip(speechTier: SpeechTier, testKey: string): Promise<TierClip> {
	// read the key's spend, render the clip, and return a failed clip if the call did not render
	const spendBeforeDollars = (await readLiteLLMKeySpend(testKey)) ?? 0
	const renderSpeechResult = await renderSpeech({ turns: CLIP_TURNS, speechTier, litellmApiKey: testKey })
	if (renderSpeechResult.outcome !== "rendered") {
		console.log(`${speechTier} clip failed  : ${JSON.stringify(renderSpeechResult)}`)
		return { speechTier, isRendered: false, estimatedDollars: 0, chargedDollars: 0 }
	}

	// estimate the call's cost from the response's token counts, and print the clip's size and tokens
	const { inputTokens, audioTokens, audioBytes } = renderSpeechResult
	const estimatedDollars = speechCost({ speechTier, inputTokens, audioTokens })
	console.log(`${speechTier} clip         : ${audioBytes.length} bytes, ${inputTokens} in, ${audioTokens} audio tokens`)

	// wait for the proxy to write the call's spend on the key
	let chargedDollars = 0
	for (let waitedMs = 0; waitedMs < SPEND_WAIT_MS && chargedDollars <= 0; waitedMs += SPEND_POLL_MS) {
		await Bun.sleep(SPEND_POLL_MS)
		chargedDollars = ((await readLiteLLMKeySpend(testKey)) ?? 0) - spendBeforeDollars
	}

	// print the estimate and the charge, so a mismatch shows which rate the proxy applied
	console.log(`${speechTier} estimated $  : ${estimatedDollars.toFixed(6)}`)
	console.log(`${speechTier} charged $    : ${chargedDollars.toFixed(6)}`)
	return { speechTier, isRendered: true, estimatedDollars, chargedDollars }
}

// whether the proxy charged the key what the app estimates, within the tolerance
function isChargedAtRate({ estimatedDollars, chargedDollars }: TierClip): boolean {
	return estimatedDollars > 0 && Math.abs(chargedDollars - estimatedDollars) <= estimatedDollars * SPEND_TOLERANCE_SHARE
}

// render the clip on the standard tier and the flex tier with a fresh test key, check each clip, and print the report
async function smokeTest(): Promise<boolean> {
	// a deployment with the speech model set empty has no speech to test
	if (!podcastEpisodeSpeechModel()) {
		console.log("PODCAST_SPEECH_MODEL is set empty, so podcast speech is off and there is nothing to test")
		return true
	}

	// provision a key for this run alone, so the spend that the run reads is its own
	const testKey = await provisionLiteLLMKey(`speech-smoke-${Date.now()}@example.com`, TEST_KEY_BUDGET_CENTS)
	try {
		// render the clip on each tier with the test key
		const standardClip = await renderTierClip("standard", testKey)
		const flexClip = await renderTierClip("flex", testKey)

		// the smoke test assertions. each tier's spend on the key has to match the app's own rate for that tier
		const checks: [string, boolean][] = [
			["the standard clip rendered", standardClip.isRendered],
			["the flex clip rendered", flexClip.isRendered],
			["the standard spend reached the key at the standard rate", isChargedAtRate(standardClip)],
			["the flex spend reached the key at the app's flex rate", isChargedAtRate(flexClip)],
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
