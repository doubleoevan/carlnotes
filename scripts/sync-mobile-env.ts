// move the mobile values from Doppler into the EAS environments. no value is typed into the EAS dashboard.
// bun run mobile:env:sync runs it twice: dev fills development and preview, and prd fills production

// the values the mobile app reads, each with its EAS visibility. a secret never reaches the bundle
const MOBILE_VALUES = [
	{ name: "EXPO_PUBLIC_SENTRY_DSN", visibility: "plaintext" },
	{ name: "EXPO_PUBLIC_POSTHOG_KEY", visibility: "plaintext" },
	{ name: "EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER", visibility: "plaintext" },
	{ name: "SENTRY_AUTH_TOKEN", visibility: "secret" },
] as const

// the Doppler config this run reads. it picks the EAS environments to fill
const dopplerConfig = Bun.env.DOPPLER_CONFIG
if (!dopplerConfig) {
	throw new Error("no Doppler config in the environment. run bun run mobile:env:sync")
}
const environments = dopplerConfig.startsWith("prd") ? ["production"] : ["development", "preview"]

// set each value through eas env:set with an explicit visibility. remove a value the config no longer holds, so
// nothing deleted from Doppler lingers in EAS
for (const mobileValue of MOBILE_VALUES) {
	const value = Bun.env[mobileValue.name]
	if (!value) {
		removeEasValue({ valueName: mobileValue.name, environments, dopplerConfig })
		continue
	}

	// eas resolves the project from apps/mobile. bun run stays silent so the secret is never echoed. eas env:set takes
	// the value as an argument only. the local process table can read an argument while the command runs
	const environmentFlags = environments.flatMap((environment) => ["--environment", environment])
	const setResult = Bun.spawnSync({
		cmd: [
			"bun",
			"run",
			"--silent",
			"--cwd",
			"apps/mobile",
			"eas",
			"env:set",
			"--name",
			mobileValue.name,
			"--value",
			value,
			...environmentFlags,
			"--visibility",
			mobileValue.visibility,
			"--scope",
			"project",
			"--non-interactive",
		],
		stdout: "inherit",
		stderr: "inherit",
	})
	if (setResult.exitCode !== 0) {
		throw new Error(`eas env:set failed for ${mobileValue.name}`)
	}
	console.log(`${mobileValue.name} set in ${environments.join(", ")}`)
}

// one removal's options: the value's name, the environments it leaves, and the config that no longer holds it
type RemoveEasValueOptions = { valueName: string; environments: string[]; dopplerConfig: string }

// remove a value from each environment. the delete fails harmlessly when the variable never existed there
function removeEasValue({ valueName, environments, dopplerConfig }: RemoveEasValueOptions): void {
	for (const environment of environments) {
		const deleteResult = Bun.spawnSync({
			cmd: [
				"bun",
				"run",
				"--silent",
				"--cwd",
				"apps/mobile",
				"eas",
				"env:delete",
				"--variable-name",
				valueName,
				"--variable-environment",
				environment,
				"--non-interactive",
			],
			stdout: "ignore",
			stderr: "ignore",
		})

		// say what happened either way. an unset value is never a silent no-op
		const removalNote = deleteResult.exitCode === 0 ? "removed from" : "not present in"
		console.log(`${valueName} is unset in ${dopplerConfig}, ${removalNote} ${environment}`)
	}
}
