// the film slots: renders wait their turn, a backfill render waits behind a new film, an aborted wait leaves the line,
// a failure gives its slot back, a wait on a provider runs outside the slot, and a rebuild has a slot of its own
import { expect, test } from "bun:test"
import { createFilmSlots, withTopicVideoRebuildSlot, withTopicVideoSlot } from "./topicVideoSlot"

// a render that holds its slot until the test lets it end, and says when it has started
function toHeldRender(): { started: Promise<void>; end: () => void; render: () => Promise<void> } {
	const started = Promise.withResolvers<void>()
	const ended = Promise.withResolvers<void>()

	// the render says it started, then waits to be ended
	const render = async (): Promise<void> => {
		started.resolve()
		await ended.promise
	}
	return { started: started.promise, end: ended.resolve, render }
}

test("a render waits its turn for a slot, an aborted wait leaves the line, and a failed render gives its slot back", async () => {
	// one slot, held by a render that will fail
	const withSlot = createFilmSlots(1)
	const held = toHeldRender()
	const failure = withSlot(undefined, async () => {
		await held.render()
		throw new Error("capture failed")
	}).catch((error: Error) => error.message)
	await held.started

	// a render that is cancelled while it waits never starts
	const abortController = new AbortController()
	let hasEntered = false
	const cancelled = withSlot(abortController.signal, async () => {
		hasEntered = true
	}).catch((error: Error) => error.name)
	abortController.abort()
	expect(await cancelled).toBe("AbortError")
	expect(hasEntered).toBe(false)

	// the next render starts only once the failed one has given its slot back
	const next = withSlot(undefined, async () => {
		hasEntered = true
	})
	expect(hasEntered).toBe(false)

	// the first render ends
	held.end()
	expect(await failure).toBe("capture failed")
	await next
	expect(hasEntered).toBe(true)
})

test("two slots run two renders at once, and the third waits", async () => {
	const withSlot = createFilmSlots(2)
	const first = toHeldRender()
	const second = toHeldRender()
	const third = toHeldRender()
	const renders = [first, second, third].map((heldRender) => withSlot(undefined, heldRender.render))

	// the first two start together, and the third starts once one of them ends
	await Promise.all([first.started, second.started])
	let hasThirdStarted = false
	void third.started.then(() => {
		hasThirdStarted = true
	})
	await Bun.sleep(5)
	expect(hasThirdStarted).toBe(false)

	// one of the two ends, and the third takes its slot
	first.end()
	await third.started
	second.end()
	third.end()
	await Promise.all(renders)
})

test("a new film takes the next slot ahead of a backfill render that waited longer", async () => {
	// one slot held, then a backfill render waiting, then a new film waiting
	const withSlot = createFilmSlots(1)
	const held = toHeldRender()
	const heldRender = withSlot(undefined, held.render)
	await held.started
	const startedRenders: string[] = []
	const backfillRender = withSlot(undefined, async () => startedRenders.push("backfill"), true)
	const newFilmRender = withSlot(undefined, async () => startedRenders.push("new film"))

	// the slot goes to the new film first
	held.end()
	await Promise.all([heldRender, backfillRender, newFilmRender])
	expect(startedRenders).toEqual(["new film", "backfill"])
})

// a paid model call can take over a minute while no core works
test("a wait on a provider gives the slot to the next render, and the first takes a slot again before it goes on", async () => {
	const withSlot = createFilmSlots(1)
	const steps: string[] = []
	const providerCall = Promise.withResolvers<string>()
	const waiting = toHeldRender()

	// the first render waits on a provider in the middle, and a second render waits for the slot
	const firstRender = withSlot(undefined, async ({ runOutsideSlot }) => {
		steps.push("first encodes")
		const clip = await runOutsideSlot(() => providerCall.promise)
		steps.push(`first encodes with ${clip}`)
	})

	// the render that waits for the slot
	const secondRender = withSlot(undefined, async () => {
		steps.push("second encodes")
		await waiting.render()
	})

	// the second render runs during the wait, and the first goes on only once the second has ended
	await waiting.started
	providerCall.resolve("the clip")
	await Bun.sleep(5)
	expect(steps).toEqual(["first encodes", "second encodes"])

	// the second render ends, and the first takes the slot again
	waiting.end()
	await Promise.all([firstRender, secondRender])
	expect(steps).toEqual(["first encodes", "second encodes", "first encodes with the clip"])
})

test("a rebuild runs beside a render that holds a render slot", async () => {
	// every render slot of the process is held
	const held = toHeldRender()
	const heldRenders = [withTopicVideoSlot(undefined, held.render)]
	await held.started

	// the rebuild does not wait for it
	let hasRebuilt = false
	await withTopicVideoRebuildSlot(undefined, async (signal) => {
		hasRebuilt = !signal.aborted
	})
	expect(hasRebuilt).toBe(true)
	held.end()
	await Promise.all(heldRenders)
})
