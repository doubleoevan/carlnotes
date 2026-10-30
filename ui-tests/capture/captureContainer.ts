// the capture container: building its pinned image, running a command in it with the output folder mounted, and the
// environment id recorded with each image capture
import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync } from "node:fs"
import { posix, resolve } from "node:path"
import { runVisibleCommand } from "../commands"
import { FONTS_FOLDER, OUTPUT_FOLDER } from "../imageCaptures"
import { readJsonFile } from "../jsonFiles"

// the image's tag, its architecture on every machine, and its Dockerfile
const CAPTURE_IMAGE_TAG = "carlnotes-ui-tests"
const CAPTURE_IMAGE_ARCHITECTURE = "linux/amd64"
const CAPTURE_DOCKERFILE_PATH = "ui-tests/Dockerfile"

// the settings that a run forwards into the container from the shell that starts it
const FORWARDED_SETTINGS = ["UI_TESTS_CAPTURE_CONCURRENCY", "UI_TESTS_CAPTURE_MINUTES"]

/**
 * Returns whether this process runs inside the capture container, whose image names its base image in its
 * environment.
 */
export function isInsideCaptureContainer(): boolean {
	return Bun.env.UI_TESTS_BASE_IMAGE !== undefined
}

/**
 * Builds the capture container's image and runs a command in the container with the output folder mounted. Returns
 * the exit code.
 */
export function runInCaptureContainer(command: string[]): number {
	// build the image from the repo for linux/amd64, the architecture that the capture container runs on
	const buildCommand = ["docker", "build", "--platform", CAPTURE_IMAGE_ARCHITECTURE, "-f", CAPTURE_DOCKERFILE_PATH]
	const buildExitCode = runVisibleCommand([...buildCommand, "-t", CAPTURE_IMAGE_TAG, "."])
	if (buildExitCode !== 0) {
		return buildExitCode
	}

	// run the command with the output folder mounted, Chromium's shared memory, and the passed settings
	mkdirSync(OUTPUT_FOLDER, { recursive: true })
	const outputMount = `${resolve(OUTPUT_FOLDER)}:/repo/${OUTPUT_FOLDER}`
	const settingOptions = FORWARDED_SETTINGS.flatMap((settingName) => ["-e", settingName])
	const runOptions = [
		"--rm",
		"--init",
		"--platform",
		CAPTURE_IMAGE_ARCHITECTURE,
		"--ipc=host",
		"-v",
		outputMount,
		...settingOptions,
	]
	return runVisibleCommand(["docker", "run", ...runOptions, CAPTURE_IMAGE_TAG, ...command])
}

/**
 * Returns a capture environment's id: the base image or the host's browser, the Playwright version, and the fonts.
 */
export function toCaptureEnvironmentId(isOnHost: boolean): string {
	// the browser's source, and the Playwright release that drives it
	const browserSource = isOnHost ? `host ${process.platform} chrome` : (Bun.env.UI_TESTS_BASE_IMAGE as string)
	const playwrightVersion = readJsonFile<{ version: string }>("node_modules/playwright-core/package.json").version
	return `${browserSource} playwright-core@${playwrightVersion} fonts@${toFontsHash()}`
}

// a short hash of every vendored font file's name and bytes
function toFontsHash(): string {
	const fontsHash = createHash("sha256")
	for (const fileName of readdirSync(FONTS_FOLDER).sort()) {
		fontsHash.update(fileName)
		fontsHash.update(readFileSync(posix.join(FONTS_FOLDER, fileName)))
	}
	return fontsHash.digest("hex").slice(0, 12)
}
