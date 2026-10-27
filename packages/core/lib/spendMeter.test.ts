import { expect, test } from "bun:test"
import { type SpendMeterProps, toSpendMeterModel } from "./spendMeter"

// a metered account with no configured checkpoints
const ACTIVITY: SpendMeterProps = {
	scanSpendCents: 0,
	chatSpendCents: 0,
	podcastEpisodeSpendCents: 0,
	budgetCents: 1000,
	monthlyBudgetCutoffs: [],
}

test("the upgrade link follows the displayed percent across the rounded 100% boundary", () => {
	for (const [scanSpendCents, percent, isUpgradeVisible] of [
		[994, 99, false],
		[995, 100, true],
		[999, 100, true],
		[1000, 100, true],
		[1200, 100, true],
	] as const) {
		// preserve the web's link visibility before, at, and after the rounded boundary
		const meter = toSpendMeterModel({ ...ACTIVITY, scanSpendCents })
		expect(meter.budgetUsedPercent).toBe(percent)
		expect(meter.isUpgradeVisible).toBe(isUpgradeVisible)
		expect(meter.budgetUsedShare).toBe(scanSpendCents / ACTIVITY.budgetCents)
	}
})

test("segment order, widths, and the podcast legend use the same budget amounts", () => {
	// leave podcast spend absent from the legend while retaining its bar position
	const withoutPodcast = toSpendMeterModel({ ...ACTIVITY, scanSpendCents: 400, chatSpendCents: 100 })
	expect(withoutPodcast.totalCents).toBe(500)
	expect(withoutPodcast.spendSegments.map(({ key, widthPercent }) => [key, widthPercent])).toEqual([
		["scans", 40],
		["podcastEpisodes", 0],
		["chat", 10],
	])
	expect(withoutPodcast.legendSegments.map(({ key }) => key)).toEqual(["scans", "chat"])

	// add the podcast legend as soon as there is spend and cap oversized segments at the bar width
	const withPodcast = toSpendMeterModel({ ...ACTIVITY, scanSpendCents: 1200, podcastEpisodeSpendCents: 1 })
	expect(withPodcast.spendSegments[0]?.widthPercent).toBe(100)
	expect(withPodcast.legendSegments.map(({ key }) => key)).toEqual(["scans", "podcastEpisodes", "chat"])
})

test("a zero budget keeps finite empty segments and the displayed spent state", () => {
	const meter = toSpendMeterModel({ ...ACTIVITY, budgetCents: 0 })
	expect(meter.budgetUsedPercent).toBe(100)
	expect(meter.isUpgradeVisible).toBe(true)
	expect(meter.spendSegments.every(({ widthPercent }) => widthPercent === 0)).toBe(true)
})
