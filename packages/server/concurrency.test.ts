// tests for the concurrency limit, the weight limit shared across callers, and the turns taken one at a time for a key
import { expect, test } from "bun:test"
import { createConcurrencyLimiter, createTurnTaker, createWeightLimiter } from "./concurrency"

test("a concurrency limit runs no more than its limit at once and runs every task", async () => {
	// six tasks under a limit of two, each counting how many run beside it
	const runLimited = createConcurrencyLimiter(2)
	let runningCount = 0
	let mostRunningCount = 0
	const results = await Promise.all(
		Array.from({ length: 6 }, (_, i) =>
			runLimited(async () => {
				// count the task while it runs
				runningCount++
				mostRunningCount = Math.max(mostRunningCount, runningCount)
				await Bun.sleep(5)
				runningCount--
				return i
			}),
		),
	)
	expect(results).toEqual([0, 1, 2, 3, 4, 5])
	expect(mostRunningCount).toBe(2)
})

test("a failed task frees its slot", async () => {
	// one slot, a failing task, then a task that needs the slot
	const runLimited = createConcurrencyLimiter(1)
	const failedTask = runLimited(() => Promise.reject(new Error("failed")))
	const nextTask = runLimited(async () => "ran")
	await expect(failedTask).rejects.toThrow("failed")
	expect(await nextTask).toBe("ran")
})

test("a weight limit takes no more than its limit at once and gives every take its turn", async () => {
	// ten takes of 30 under a limit of 100, each counting the weight taken beside it
	const takeWeight = createWeightLimiter(100)
	let takenWeight = 0
	let mostTakenWeight = 0
	const results = await Promise.all(
		Array.from({ length: 10 }, async (_, i) => {
			// count the weight while it is taken
			const releaseWeight = await takeWeight(30)
			takenWeight += 30
			mostTakenWeight = Math.max(mostTakenWeight, takenWeight)
			await Bun.sleep(5)

			// release the weight for the takes waiting behind it
			takenWeight -= 30
			releaseWeight()
			return i
		}),
	)
	expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
	expect(mostTakenWeight).toBe(90)
})

test("a take with room still waits behind an older take", async () => {
	// 60 of 100 taken, an older take of 60 waiting, and a take of 30 that would fit beside the first
	const takeWeight = createWeightLimiter(100)
	const startedTakes: string[] = []
	const releaseFirstWeight = await takeWeight(60)
	const olderTake = takeWeight(60).then(() => startedTakes.push("older"))
	const lighterTake = takeWeight(30).then(() => startedTakes.push("lighter"))
	await Bun.sleep(5)
	expect(startedTakes).toEqual([])

	// the release starts both in order, because 60 and 30 fit together
	releaseFirstWeight()
	await Promise.all([olderTake, lighterTake])
	expect(startedTakes).toEqual(["older", "lighter"])
})

test("a weight above the limit is taken alone", async () => {
	// 25 under a limit of 10 starts at once, and a take of 5 waits for it
	const takeWeight = createWeightLimiter(10)
	const releaseHeavyWeight = await takeWeight(25)
	let isLightWeightTaken = false
	const lightTake = takeWeight(5).then(() => {
		isLightWeightTaken = true
	})
	await Bun.sleep(5)
	expect(isLightWeightTaken).toBe(false)

	// the light take starts once the heavy one is released
	releaseHeavyWeight()
	await lightTake
	expect(isLightWeightTaken).toBe(true)
})

test("a weight released twice is returned once", async () => {
	// a take of the whole limit, released twice
	const takeWeight = createWeightLimiter(10)
	const releaseWeight = await takeWeight(10)
	releaseWeight()
	releaseWeight()

	// the next take fills the limit again, so the one after it waits
	await takeWeight(10)
	let isLastWeightTaken = false
	void takeWeight(10).then(() => {
		isLastWeightTaken = true
	})
	await Bun.sleep(5)
	expect(isLastWeightTaken).toBe(false)
})

// a take that waits leaves the wait once its signal aborts, and the take behind it starts
test("a waiting take whose signal aborts rejects and lets the take behind it start", async () => {
	const takeWeight = createWeightLimiter(10)
	const releaseFirst = await takeWeight(10)

	// two takes wait for the first, and the older one's signal aborts
	const abortController = new AbortController()
	const abortedTake = takeWeight(10, abortController.signal)
	const laterTake = takeWeight(10)
	abortController.abort(new Error("the wait ran out"))
	await expect(abortedTake).rejects.toThrow("the wait ran out")

	// the later take starts once the first is released, as if the aborted one never waited
	releaseFirst()
	const releaseLater = await laterTake
	releaseLater()

	// a take whose signal has already aborted never takes the weight
	await expect(takeWeight(1, abortController.signal)).rejects.toThrow("the wait ran out")
	const releaseAll = await takeWeight(10)
	releaseAll()
})

// one key's turns are taken one at a time, in order, and another key's turn does not wait for them
test("a key's turns are taken one at a time, and another key's turn is taken at once", async () => {
	const takeTurn = createTurnTaker()
	const neverAborted = new AbortController().signal
	const takenTurns: string[] = []

	// the first key's second turn waits for its first
	const endFirstTurn = await takeTurn("user-1", neverAborted)
	const secondTurn = takeTurn("user-1", neverAborted).then((endTurn) => {
		takenTurns.push("user-1 second")
		return endTurn
	})

	// the other key's turn is taken while the first key's second turn still waits
	const endOtherTurn = await takeTurn("user-2", neverAborted)
	takenTurns.push("user-2 first")
	await Bun.sleep(1)
	expect(takenTurns).toEqual(["user-2 first"])

	// the second turn is taken once the first one ends
	endFirstTurn()
	const endSecondTurn = await secondTurn
	expect(takenTurns).toEqual(["user-2 first", "user-1 second"])
	endSecondTurn()
	endOtherTurn()
})

// a turn given up while it waits does not hold the turns behind it
test("a waiting turn whose signal aborts rejects, and the key's next turn waits for the earlier one alone", async () => {
	const takeTurn = createTurnTaker()
	const neverAborted = new AbortController().signal
	const endFirstTurn = await takeTurn("user-1", neverAborted)

	// the second turn gives up, and a third waits behind it
	const abortController = new AbortController()
	const abortedTurn = takeTurn("user-1", abortController.signal)
	const thirdTurn = takeTurn("user-1", neverAborted)
	abortController.abort(new Error("the request was dropped"))
	await expect(abortedTurn).rejects.toThrow("the request was dropped")

	// the third turn is taken once the first ends, with nobody ending the turn that was given up
	endFirstTurn()
	const endThirdTurn = await thirdTurn
	endThirdTurn()
})
