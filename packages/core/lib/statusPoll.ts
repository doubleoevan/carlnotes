// a poll that reads a status in place of its page: a read of the status on an interval while the app is focused and
// online, until the poll's time limit, and a read of the page once the status leaves in progress
import { startLimitedPoll } from "./limitedPoll"

// the read of the status, null for a failed read, whether a status is still in progress, the read of the page, the
// wait between reads, and how long the poll reads before it stops
type StartStatusPollOptions<StatusRead> = {
	readStatus: () => Promise<StatusRead | null>
	isInProgress: (statusRead: StatusRead) => boolean
	readPage: () => void | Promise<void>
	pollMs: number
	limitMs: number
}

/**
 * Reads a status on an interval and reads the page once the status leaves in progress. A failed status read stops the
 * poll. Returns the call that stops the reads.
 */
export function startStatusPoll<StatusRead>({
	readStatus,
	isInProgress,
	readPage,
	pollMs,
	limitMs,
}: StartStatusPollOptions<StatusRead>): () => void {
	// the stop ends the reads, and a status read in flight reads no page
	const stopPoll = startLimitedPoll({
		read: async (isStopped) => {
			// a failed status read stops the poll
			const statusRead = await readStatus()
			if (!statusRead) {
				stopPoll()
				return
			}

			// a status out of progress reads the page, unless the poll stopped while the status was read
			if (!isStopped() && !isInProgress(statusRead)) {
				await readPage()
			}
		},
		pollMs,
		limitMs,
	})
	return stopPoll
}
