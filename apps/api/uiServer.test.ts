// the api's boot with the ui's server build: a production boot that cannot load the build exits before it listens, and
// a development boot serves without one
import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { UI_SERVER_ENTRY } from "./bundlePaths"

// the api's entry, the port each boot listens on, and how long a boot may take
const API_ENTRY_PATH = resolve(import.meta.dir, "index.ts")
const BOOT_PORT = "3977"
const BOOT_TIMEOUT_MS = 60_000

// the temporary directories the boots ran in, removed after each test
const bootDirectories: string[] = []
afterEach(async () => {
	const removedDirectories = bootDirectories.splice(0)
	await Promise.all(removedDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
})

// a production boot with no server build reports why and exits non-zero
test(
	"a production boot with no ui server build exits 1 before it listens",
	async () => {
		const bootResult = await bootApi({ nodeEnv: "production", serverEntryText: undefined })
		expect(bootResult.exitCode).toBe(1)
		expect(bootResult.stderr).toContain("the ui's server build cannot load, so the api exits")
		expect(bootResult.stderr).toContain(`the ui's server build is missing at ${UI_SERVER_ENTRY}`)
	},
	BOOT_TIMEOUT_MS,
)

// a production boot whose server build throws on import, as one with an undeclared package does, exits non-zero
test(
	"a production boot whose ui server build fails to import exits 1",
	async () => {
		const serverEntryText = 'import { z } from "an-undeclared-package"\nexport default { fetch: () => z }\n'
		const bootResult = await bootApi({ nodeEnv: "production", serverEntryText })
		expect(bootResult.exitCode).toBe(1)
		expect(bootResult.stderr).toContain("the ui's server build cannot load, so the api exits")
		expect(bootResult.stderr).toContain("an-undeclared-package")
	},
	BOOT_TIMEOUT_MS,
)

// a development boot with no server build listens, and its health check responds
test(
	"a development boot with no ui server build serves the api",
	async () => {
		const bootResult = await bootApi({ nodeEnv: "development", serverEntryText: undefined })
		expect(bootResult.exitCode).toBeNull()
		expect(bootResult.healthStatus).toBe(200)
	},
	BOOT_TIMEOUT_MS,
)

// the environment the boot runs under, and the server entry it finds, or none
type BootApiOptions = { nodeEnv: string; serverEntryText: string | undefined }

// how a boot ended: its exit code, or null if it was still serving, its health check's status, and what it logged
type BootResult = { exitCode: number | null; healthStatus: number | null; stderr: string }

// boot the api in an empty directory, wait until it exits or its health check responds, and stop it
async function bootApi({ nodeEnv, serverEntryText }: BootApiOptions): Promise<BootResult> {
	// an empty directory, with the server entry if the test writes one
	const bootDirectory = await mkdtemp(join(tmpdir(), "carl-boot-"))
	bootDirectories.push(bootDirectory)
	if (serverEntryText !== undefined) {
		await mkdir(join(bootDirectory, dirname(UI_SERVER_ENTRY)), { recursive: true })
		await writeFile(join(bootDirectory, UI_SERVER_ENTRY), serverEntryText)
	}

	// boot the api with a secret, so the auth library never stops a production boot first
	const bootProcess = Bun.spawn(["bun", API_ENTRY_PATH], {
		cwd: bootDirectory,
		env: { ...process.env, NODE_ENV: nodeEnv, PORT: BOOT_PORT, BETTER_AUTH_SECRET: "a-test-secret-of-32-characters!!" },
		stdout: "ignore",
		stderr: "pipe",
	})

	// wait for the process to exit or its health check to respond, whichever comes first
	const healthStatus = await waitForHealthOrExit(bootProcess.exited)
	const exitCode = healthStatus === null ? await bootProcess.exited : null
	bootProcess.kill()
	await bootProcess.exited
	return { exitCode, healthStatus, stderr: await new Response(bootProcess.stderr).text() }
}

// poll the health check until it responds or the process exits, and return its status, or null if the process exited
async function waitForHealthOrExit(processExit: Promise<number>): Promise<number | null> {
	// note the exit, so the poll stops
	let hasExited = false
	void processExit.then(() => {
		hasExited = true
	})

	// poll every 200 milliseconds
	while (!hasExited) {
		const healthResponse = await fetch(`http://localhost:${BOOT_PORT}/api/health`).catch(() => null)
		if (healthResponse) {
			return healthResponse.status
		}
		await Bun.sleep(200)
	}

	// the process exited before its health check responded
	return null
}
