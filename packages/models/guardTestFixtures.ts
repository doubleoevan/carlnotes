// the llm-guard scanner set-ups that the tests share: a fake scanner that returns one verdict, and no scanner at all
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"

/**
 * Runs a test case against a fake llm-guard scanner that returns the same verdict for every screen.
 */
export async function withScanner(guardResponse: unknown, run: () => Promise<void>): Promise<void> {
	// start the fake scanner and point the scanner url at it
	const scanner = Bun.serve({ port: 0, fetch: () => Response.json(guardResponse) })
	const restoreEnvSettings = saveEnvSettings(["LLM_GUARD_URL"])
	Bun.env.LLM_GUARD_URL = scanner.url.origin

	// a failing case still puts the url back and stops the fake scanner, so it can't leak into the cases after it
	try {
		await run()
	} finally {
		restoreEnvSettings()
		await scanner.stop(true)
	}
}

/**
 * Runs a test case with no scanner configured, so an llm-guard screen is skipped.
 */
export async function withoutScanner(run: () => Promise<void>): Promise<void> {
	// unset the scanner url
	const restoreEnvSettings = saveEnvSettings(["LLM_GUARD_URL"])
	delete Bun.env.LLM_GUARD_URL

	// a failing case still puts the url back, so it cannot leak into the cases after it
	try {
		await run()
	} finally {
		restoreEnvSettings()
	}
}
