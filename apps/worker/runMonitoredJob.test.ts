import { expect, test } from "bun:test"
import { toMonitoredJob } from "./runMonitoredJob"

test("a job with a monitor and a command after the separator is read", () => {
	expect(toMonitoredJob(["scan-sweep", "--", "bun", "apps/worker/schedule.ts"])).toEqual({
		jobName: "scan-sweep",
		command: ["bun", "apps/worker/schedule.ts"],
	})
	expect(toMonitoredJob(["migrate", "--", "bun", "packages/db/migrate.ts"])?.jobName).toBe("migrate")
})

test("an unknown job, a missing separator, or a missing command is rejected", () => {
	expect(toMonitoredJob(["nightly-thing", "--", "bun", "x.ts"])).toBeNull()
	expect(toMonitoredJob(["scan-sweep", "bun", "apps/worker/schedule.ts"])).toBeNull()
	expect(toMonitoredJob(["scan-sweep", "--"])).toBeNull()
	expect(toMonitoredJob(["toString", "--", "bun", "x.ts"])).toBeNull()
})
