// the review pipeline eval's scanner measurement: LLM Guard's false-positive and catch rates over the fixtures'
// benign articles, known attacks, and images, with no model calls and no spend
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { type ScreenVerdict, screenImage, screenText } from "@carlnotes/models/guard"
import { stopTextRecognitionWorker } from "@carlnotes/models/imageText"
import type { EvalFixture, InjectionImage } from "./reviewPipelineEval"
import { FIXTURES_DIRECTORY } from "./reviewPipelineExport"

// measure only LLM Guard's false-positive and catch rates on text and images: no model calls, no spend.
// these are the numbers a version bump changes, so the weekly ci check measures a candidate container with them
export async function measureGuardOnly(): Promise<void> {
	// the goal is measuring the guard, so a missing url is a failed run, not a skipped one
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl) {
		console.error("LLM_GUARD_URL must be set for --guard-only, since LLM Guard is what it measures")
		process.exitCode = 1
		return
	}

	// fail the run if the scanner is unreachable
	if (!(await isScannerReachable(guardUrl))) {
		console.error(`scanner at ${guardUrl} is unreachable, so there is nothing to measure`)
		process.exitCode = 1
		return
	}

	// every fixture's benign articles and known attacks. a fixture with only one of the two sets is fine here
	const fixtureFiles = readdirSync(FIXTURES_DIRECTORY).filter((file) => file.endsWith(".json"))
	const fixtures = fixtureFiles.map(
		(fixtureFile) => JSON.parse(readFileSync(join(FIXTURES_DIRECTORY, fixtureFile), "utf8")) as EvalFixture,
	)
	const benignArticles = fixtures.flatMap((fixture) => fixture.injectionProse)
	const attacks = fixtures.flatMap((fixture) => fixture.injectionAttacks)

	// an empty corpus measures nothing, so it fails instead of passing quietly
	if (benignArticles.length === 0 && attacks.length === 0) {
		console.error(
			`no benign-injection articles or attack strings under ${FIXTURES_DIRECTORY}, so a pass here would be hollow`,
		)
		process.exitCode = 1
		return
	}

	// screen the benign articles, which discuss injection without attempting it, and print each false positive.
	// a text that the scanner could not screen, such as a text that timed out, counts on neither side
	const articleScreenTextsResult = await screenTexts(benignArticles.map((benignArticle) => benignArticle.content))
	for (const [i, screenVerdict] of articleScreenTextsResult.screenVerdicts.entries()) {
		if (screenVerdict.isFlagged) {
			console.log(`false positive: ${benignArticles[i]?.title} (${screenVerdict.detectors.join(", ")})`)
		}
	}

	// the catch-rate side: every miss here is wrong, since these are real, known attack strings
	const attackScreenTextsResult = await screenTexts(attacks)
	for (const [i, screenVerdict] of attackScreenTextsResult.screenVerdicts.entries()) {
		if (!screenVerdict.isFlagged) {
			console.log(
				`${screenVerdict.outcome === "screened" ? "missed" : "unscreened"} attack: ${attacks[i]?.slice(0, 60)}`,
			)
		}
	}

	// the two text rate lines. both are printed because a scanner that flags nothing
	// would otherwise look perfect, showing 0% false positives and 0% caught at the same time
	console.log(
		`scanner false-positive rate: ${articleScreenTextsResult.flaggedCount}/${articleScreenTextsResult.screenedCount} benign articles flagged`,
	)
	console.log(
		`scanner attack catch rate: ${attackScreenTextsResult.flaggedCount}/${attackScreenTextsResult.screenedCount} known attacks caught`,
	)

	// count the texts that neither rate counts
	const unscreenedCount =
		benignArticles.length +
		attacks.length -
		articleScreenTextsResult.screenedCount -
		attackScreenTextsResult.screenedCount

	// print the count if any text went unscreened
	if (unscreenedCount > 0) {
		console.log(`${unscreenedCount} texts could not be screened, so neither rate counts them`)
	}

	// the images, screened by the text they show, then the text recognition worker stops so the run can exit
	await printImageScreenRates(fixtures.flatMap((fixture) => fixture.injectionImages ?? []))
	await stopTextRecognitionWorker()
}

// screen each image by the text it shows and print the image false-positive and catch rates on lines of their own.
// an image whose read or screen failed counts on neither side and is named
async function printImageScreenRates(injectionImages: InjectionImage[]): Promise<void> {
	if (injectionImages.length === 0) {
		return
	}

	// screen the images one at a time, naming each one left out and each wrong verdict
	const screenedImages: { isAttack: boolean; isFlagged: boolean }[] = []
	for (const injectionImage of injectionImages) {
		const imageBytes = new Uint8Array(await Bun.file(join(FIXTURES_DIRECTORY, injectionImage.file)).arrayBuffer())
		const screenVerdict = await screenImage(imageBytes)

		// an image left out counts on neither side, and is named
		if (screenVerdict.outcome !== "screened") {
			console.log(`unscreened image: ${injectionImage.title}`)
			continue
		}

		// a screened image counts on its side, and a wrong verdict is named
		if (screenVerdict.isFlagged !== injectionImage.isAttack) {
			console.log(`${injectionImage.isAttack ? "missed attack" : "false positive"} image: ${injectionImage.title}`)
		}
		screenedImages.push({ isAttack: injectionImage.isAttack, isFlagged: screenVerdict.isFlagged })
	}

	// the two image lines, apart from the text rates
	const benignImages = screenedImages.filter((screenedImage) => !screenedImage.isAttack)
	const attackImages = screenedImages.filter((screenedImage) => screenedImage.isAttack)
	const flaggedBenignCount = benignImages.filter((screenedImage) => screenedImage.isFlagged).length
	const caughtAttackCount = attackImages.filter((screenedImage) => screenedImage.isFlagged).length
	console.log(`scanner image false-positive rate: ${flaggedBenignCount}/${benignImages.length} benign images flagged`)
	console.log(`scanner image catch rate: ${caughtAttackCount}/${attackImages.length} attack images caught`)
}

// screen each text one at a time, and count the verdicts that the scanner flagged and the texts that it screened
async function screenTexts(
	texts: string[],
): Promise<{ screenVerdicts: ScreenVerdict[]; flaggedCount: number; screenedCount: number }> {
	const screenVerdicts: ScreenVerdict[] = []
	for (const text of texts) {
		screenVerdicts.push(await screenText(text, "page"))
	}
	return {
		screenVerdicts,
		flaggedCount: screenVerdicts.filter((screenVerdict) => screenVerdict.isFlagged).length,
		screenedCount: screenVerdicts.filter((screenVerdict) => screenVerdict.outcome === "screened").length,
	}
}

// the share of the given texts that the scanner flags, or null if there is no scanner to ask. the false-positive rate
// and the catch rate both measure this way
export async function toFlaggedRate(texts: string[]): Promise<number | null> {
	// with no scanner, a scanner that is down, or nothing to measure, report null instead of a zero that looks like a result
	const guardUrl = Bun.env.LLM_GUARD_URL
	if (!guardUrl || texts.length === 0 || !(await isScannerReachable(guardUrl))) {
		return null
	}

	// count only the texts that the scanner screened, and print the count of texts that the rate leaves out
	const { flaggedCount, screenedCount } = await screenTexts(texts)
	if (screenedCount < texts.length) {
		console.log(`${texts.length - screenedCount} texts could not be screened, so the rate leaves them out`)
	}
	return screenedCount === 0 ? null : flaggedCount / screenedCount
}

// whether the scanner responds to a probe request
async function isScannerReachable(guardUrl: string): Promise<boolean> {
	const probeResponse = await fetch(`${guardUrl}/analyze/prompt`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt: "reachability probe" }),
	}).catch(() => null)
	return Boolean(probeResponse?.ok)
}
