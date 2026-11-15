// runs a Northflank job's command under Sentry. a scheduled job checks in to its cron monitor when it starts and again
// with its result, and a release job reports a failed run. the root scripts run this inside doppler run, so a job whose
// secrets never load sends no check-in, and its monitor reports the run as missed

import { type CronMonitorConfig, finishCronCheckIn, startCronCheckIn } from "@carlnotes/server/cronMonitoring"
import { reportError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"

// what every cron monitor shares: schedules in UTC, and one good run to resolve its alert
const UTC_CRON_MONITOR_CONFIG = { timezone: "Etc/UTC", recoveryThreshold: 1 }

// each scheduled job's cron monitor, named for its Northflank job, with the job's cron schedule, and its Northflank time
// limit as the longest run. the sweep's monitor alerts after two missed or failed runs, and the daily reset's after one
export const CRON_MONITOR_CONFIGS: Record<string, CronMonitorConfig> = {
	// the sweep, every 15 minutes with a 10 minute limit
	"scan-sweep": {
		...UTC_CRON_MONITOR_CONFIG,
		schedule: { type: "crontab", value: "*/15 * * * *" },
		checkinMargin: 5,
		maxRuntime: 10,
		failureIssueThreshold: 2,
	},
	// the monthly budget reset, daily at 00:05 UTC with an hour's limit
	"reset-monthly-budgets": {
		...UTC_CRON_MONITOR_CONFIG,
		schedule: { type: "crontab", value: "5 0 * * *" },
		checkinMargin: 30,
		maxRuntime: 60,
		failureIssueThreshold: 1,
	},
}

// the jobs a release runs. they have no schedule for a monitor to miss, so only a failed run is reported
const RELEASE_JOB_NAMES = new Set(["migrate", "docs-sync", "edge-purge"])

// the signals Northflank stops a job with, which the job's command receives too
const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const

// the job's name and the command it runs
export type MonitoredJob = { jobName: string; command: string[] }

/**
 * Returns the job that the arguments name, as `<job name> -- <command>`, or null for an unknown job or a missing
 * separator or command.
 */
export function toMonitoredJob(args: string[]): MonitoredJob | null {
	const [jobName = "", separator, ...command] = args
	const isKnownJob = Object.hasOwn(CRON_MONITOR_CONFIGS, jobName) || RELEASE_JOB_NAMES.has(jobName)
	return isKnownJob && separator === "--" && command.length > 0 ? { jobName, command } : null
}

// run a job's command with the job's output, pass a stop signal on to it so it can finish its own shutdown, and return
// its exit code
async function runJobCommand(command: string[]): Promise<number> {
	const jobProcess = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"] })
	for (const stopSignal of STOP_SIGNALS) {
		process.on(stopSignal, () => jobProcess.kill(stopSignal))
	}
	return await jobProcess.exited
}

// run the command, check in its result or report a failed release job, and return its exit code
async function runMonitoredJob({ jobName, command }: MonitoredJob): Promise<number> {
	// start monitoring and the cron monitor's check-in, if the job has a monitor
	startMonitoring()
	const cronMonitorConfig = CRON_MONITOR_CONFIGS[jobName]
	const checkInId = cronMonitorConfig ? startCronCheckIn(jobName, cronMonitorConfig) : null
	const startedAt = performance.now()

	// run the command. a command that cannot start counts as a failed run, so its monitor reports it at once
	const exitCode = await runJobCommand(command).catch((error: unknown) => {
		console.error(`the ${jobName} job could not start`, error)
		return 1
	})

	// check in the result, or report a release job that failed
	if (checkInId) {
		const durationSeconds = (performance.now() - startedAt) / 1000
		finishCronCheckIn({ checkInId, monitorSlug: jobName, isSucceeded: exitCode === 0, durationSeconds })
	} else if (exitCode !== 0 && RELEASE_JOB_NAMES.has(jobName)) {
		reportError(new Error(`the ${jobName} job exited with code ${exitCode}`), "job", { jobName })
	}

	// send the check-in or the report before the process exits
	await shutdownMonitoring()
	return exitCode
}

// run the job named on the command line, and exit with its code
if (import.meta.main) {
	const monitoredJob = toMonitoredJob(Bun.argv.slice(2))
	if (!monitoredJob) {
		console.error("usage: bun apps/worker/runMonitoredJob.ts <job name> -- <command>, for a scheduled or release job")
		process.exit(2)
	}
	process.exit(await runMonitoredJob(monitoredJob))
}
