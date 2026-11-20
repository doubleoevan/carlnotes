// the film slots of one worker process: how many films render at once, and the slot a poster rebuild takes. a render is
// about two cores wide, so the slots keep the encodes inside the node's cores and its scratch disk

import { createWeightLimiter } from "@carlnotes/server/concurrency"
import { topicVideoConcurrency } from "@carlnotes/server/podcastEpisodeSettings"

// how long a render may run once it holds a slot, which stops the attempt before Temporal's four-hour limit
const SLOT_DEADLINE_MS = 3.8 * 3600_000

// runs a wait on a provider outside the slot: the slot is given back for the wait, where no core works, and one is
// taken again before the call returns
export type RunOutsideSlot = <Result>(wait: () => Promise<Result>) => Promise<Result>

// a render's hold on a film slot: the signal that aborts once the render is cancelled or has run past its deadline, and
// the call that runs a provider wait outside the slot
export type FilmSlot = { signal: AbortSignal; runOutsideSlot: RunOutsideSlot }

/**
 * Runs a wait at once, for a caller that holds no slot to give back.
 */
export const runWithoutSlot: RunOutsideSlot = (wait) => wait()

// takes one of the slots, waiting its turn, and resolves with the call that gives it back
type TakeSlot = (weight: number, signal?: AbortSignal, isAhead?: boolean) => Promise<() => void>

/**
 * Returns the call that runs a render in one of a number of slots. A render waits its turn for a slot, oldest first,
 * under its own signal, and a backfill render waits behind every other render. Its deadline starts once it holds the
 * slot, so a wait costs it no render time. The slot is held through the render's cleanup.
 */
export function createFilmSlots(
	slotCount: number,
): <Result>(
	signal: AbortSignal | undefined,
	render: (filmSlot: FilmSlot) => Promise<Result>,
	isBackfillRender?: boolean,
) => Promise<Result> {
	const takeSlot: TakeSlot = createWeightLimiter(slotCount)
	return async (signal, render, isBackfillRender = false) => {
		// wait for a slot, then start the deadline
		let releaseSlot = await takeSlot(1, signal, !isBackfillRender)
		const deadline = AbortSignal.timeout(SLOT_DEADLINE_MS)
		const activeSignal = signal ? AbortSignal.any([deadline, signal]) : deadline

		// a render's chapters run one after another, so no two of its provider waits overlap
		const runOutsideSlot: RunOutsideSlot = async (wait) => {
			releaseSlot()
			try {
				return await wait()
			} finally {
				releaseSlot = await takeSlot(1, activeSignal, !isBackfillRender)
			}
		}

		// run the render, and give back whichever slot it holds at its end
		try {
			return await render({ signal: activeSignal, runOutsideSlot })
		} finally {
			releaseSlot()
		}
	}
}

/**
 * Runs a new film's render or a selected upgrade in one of the process's render slots. The slots are
 * TOPIC_VIDEO_CONCURRENCY of them, which is also how many film tasks the film Worker takes, and at least one.
 */
export const withTopicVideoSlot = createFilmSlots(Math.max(1, topicVideoConcurrency()))

// a poster rebuild's one slot. a rebuild is short and its owner is waiting on it, so it runs beside the renders
// instead of behind one, and two rebuilds still run one after another
const withRebuildSlot = createFilmSlots(1)

/**
 * Runs a poster rebuild in the process's rebuild slot, and stops it at the same deadline a render has.
 */
export function withTopicVideoRebuildSlot<Result>(
	signal: AbortSignal | undefined,
	rebuild: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
	return withRebuildSlot(signal, (filmSlot) => rebuild(filmSlot.signal))
}
