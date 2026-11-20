// what the reaper's tests share: the time of every sweep, and a Temporal that says whether every workflow runs. only
// tests import it
import { spyOn } from "bun:test"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as monitoring from "@carlnotes/server/monitoring"

// the time of every sweep in the reaper's tests
export const NOW = new Date("2026-11-20T12:00:00Z")

// the spies on Temporal's read and terminate, and on the report
type TemporalSpies = {
	readSpy: ReturnType<typeof spyOn>
	terminateSpy: ReturnType<typeof spyOn>
	reportSpy: ReturnType<typeof spyOn>
}

// whether Temporal says that every workflow still runs
type SpyOnTemporalOptions = { isRunning: boolean }

/**
 * Makes Temporal say whether every workflow still runs, and spies on the terminate and the report.
 */
export function spyOnTemporal({ isRunning }: SpyOnTemporalOptions): TemporalSpies {
	return {
		readSpy: spyOn(temporalClient, "isWorkflowRunning").mockResolvedValue(isRunning),
		terminateSpy: spyOn(temporalClient, "terminateWorkflow").mockResolvedValue(undefined),
		reportSpy: spyOn(monitoring, "reportError").mockImplementation(() => undefined),
	}
}
