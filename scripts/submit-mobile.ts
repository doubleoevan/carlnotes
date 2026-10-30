// submit the latest production build to App Store Connect or the Play Console: under doppler run --config prd, after
// the contract freeze check, with the store keys written from Doppler for the length of the submit and removed after.
// --dry-run does everything but the submit itself

import { assertSubmitValues, removeSubmitKeyFiles, saveSubmitSetup, toSubmitPlatform } from "./submitMobile"

// the platform, the environment, and the values the submit needs
const platform = toSubmitPlatform(process.argv.slice(2))
const isDryRun = process.argv.includes("--dry-run")
if (!Bun.env.DOPPLER_CONFIG?.startsWith("prd")) {
	console.error(`mobile submit: run under doppler run --config prd, not ${Bun.env.DOPPLER_CONFIG ?? "no config"}`)
	process.exit(1)
}
assertSubmitValues(platform, Bun.env)

// the frozen contract has to match the code the build shipped with
const freezeCheck = Bun.spawnSync({
	cmd: ["bun", "scripts/freeze-contract.ts", "--check"],
	stdout: "inherit",
	stderr: "inherit",
})
if (freezeCheck.exitCode !== 0) {
	console.error("mobile submit: the contract freeze is missing or stale. run bun run contract:freeze and commit it")
	process.exit(1)
}

// write the keys, submit, and remove the keys however the submit ends
const submitSetup = saveSubmitSetup(platform, Bun.env)
let isSubmitFailed = false
try {
	const submitCommand = [
		"bun",
		"run",
		"--silent",
		"--cwd",
		"apps/mobile",
		"eas",
		"submit",
		"--profile",
		"production",
		"--platform",
		platform,
		"--latest",
		"--non-interactive",
	]
	if (isDryRun) {
		console.log(`mobile submit: dry run, would run ${submitCommand.join(" ")}`)
	} else {
		const submitResult = Bun.spawnSync({
			cmd: submitCommand,
			env: { ...Bun.env, ...submitSetup.env },
			stdout: "inherit",
			stderr: "inherit",
		})

		// a failed submit is reported once the keys are removed. an exit here would skip the finally block
		isSubmitFailed = submitResult.exitCode !== 0
	}
} finally {
	removeSubmitKeyFiles(submitSetup)
}

// say how it ended, with the keys removed either way
if (isSubmitFailed) {
	console.error(`mobile submit: eas submit failed for ${platform}, key files removed`)
	process.exit(1)
}
console.log(`mobile submit: ${platform} ${isDryRun ? "dry run finished" : "submitted"}, key files removed`)
