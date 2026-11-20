// a card element drawn to a png in a child process of its own. a 3000-pixel draw stalls the event loop for a fifth of
// a second and takes hundreds of megabytes that a process never returns, so a process that serves requests draws a
// large image through this module, and the memory goes back when the child process exits

import { runChildProcessRequest } from "@carlnotes/server/childProcessRequest"
import type { toCardElementPng } from "./cardElementPng"

// the child process's script, started with the runtime this process runs on
const CHILD_PROCESS_PATH = new URL("./cardElementPngChild.ts", import.meta.url).pathname

// how long one draw may take before its child process is stopped. a 3000-pixel cover draws in under a second
const DRAW_TIME_LIMIT_MS = 60_000

// what the child process replies: it drew the png, or the draw failed
type DrawReply = { status: "drawn"; png: Uint8Array } | { status: "failed"; reason: string }

/**
 * Draws an element to a png as toCardElementPng does, in a child process that exits once it has replied. Throws an
 * error if the draw fails, the child process exits with no png, or the draw passes its time limit.
 */
export function toCardElementPngInChildProcess(
	drawRequest: Parameters<typeof toCardElementPng>[0],
	timeLimitMs = DRAW_TIME_LIMIT_MS,
): Promise<Uint8Array> {
	// the child process draws with the app's fonts alone, so it gets none of this process's environment
	return runChildProcessRequest({
		scriptPath: CHILD_PROCESS_PATH,
		request: drawRequest,
		env: {},
		timeLimitMs,
		toResult: (drawReply: DrawReply) => {
			if (drawReply.status === "failed") {
				throw new Error(`the card element could not be drawn: ${drawReply.reason}`)
			}
			return drawReply.png
		},
		toTimeLimitError: () => new Error(`the card element was not drawn within ${timeLimitMs} ms`),
		toExitError: ({ exitCode }) =>
			new Error(`the card element's child process exited with code ${exitCode} and no png`),
	})
}
