// durable debouncing and retry timers pass only a Topic id and content-free work metadata
import { PERSONAL_SOURCES_CONTEXT_SIGNAL } from "@carlnotes/contracts/personalSourcesWork"
import { condition, continueAsNew, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow"
import { runPersonalSourcesContextLoop } from "./personalSourcesContextLoop"
import type * as activities from "./summarizePersonalSourcesContextActivities"

// database recovery and model timeouts remain bounded independently of the workflow's idle timer
const { readPersonalSourcesWork, rebuildPersonalSourcesContext } = proxyActivities<typeof activities>({
	startToCloseTimeout: "5 minutes",
	retry: { maximumAttempts: 3, initialInterval: "10 seconds" },
})
const personalSourcesChanged = defineSignal(PERSONAL_SOURCES_CONTEXT_SIGNAL)

/**
 * Coalesces revisions and rebuilds each sender's private summary without exposing entry text to workflow history.
 */
export async function summarizePersonalSourcesContext(topicId: string): Promise<void> {
	let signalVersion = 0
	setHandler(personalSourcesChanged, () => {
		signalVersion += 1
	})
	const outcome = await runPersonalSourcesContextLoop({
		readWork: () => readPersonalSourcesWork(topicId),
		rebuild: () => rebuildPersonalSourcesContext(topicId),
		readSignalVersion: () => signalVersion,
		waitForChange: async (observedVersion, delay) => {
			await condition(() => signalVersion !== observedVersion, delay)
		},
	})
	if (outcome === "continue") {
		return continueAsNew<typeof summarizePersonalSourcesContext>(topicId)
	}
}

// running histories still name the previous workflow type; new starts use summarizePersonalSourcesContext
export { summarizePersonalSourcesContext as distillPersonalSourcesContext }
