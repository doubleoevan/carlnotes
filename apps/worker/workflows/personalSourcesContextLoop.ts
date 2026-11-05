import { type PersonalSourcesWork, personalSourcesWorkDelay } from "@carlnotes/contracts/personalSourcesWork"

type PersonalSourcesContextLoopOptions = {
	readWork: () => Promise<PersonalSourcesWork | null>
	rebuild: () => Promise<string>
	readSignalVersion: () => number
	waitForChange: (observedVersion: number, delay: number) => Promise<void>
}

/**
 * Runs durable metadata decisions with the workflow's replayable clock and wait adapter.
 */
export async function runPersonalSourcesContextLoop({
	readWork,
	rebuild,
	readSignalVersion,
	waitForChange,
}: PersonalSourcesContextLoopOptions): Promise<"done" | "continue"> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		// a signal received while an activity runs must prevent a stale timer from sleeping
		const observedVersion = readSignalVersion()
		const work = await readWork()
		if (!work) {
			return "done"
		}
		const delay = personalSourcesWorkDelay(work)
		if (delay === null) {
			return "done"
		}
		if (delay > 0) {
			await waitForChange(observedVersion, delay)
			continue
		}
		// failed and budget-blocked attempts leave the durable revision pending for a later retry
		const outcome = await rebuild()
		if (outcome === "idle" || outcome === "busy") {
			await waitForChange(observedVersion, 15 * 60_000)
		}
	}
	return "continue"
}
