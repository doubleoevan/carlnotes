// unchecked image check batch tests: the sweep stops at the first check that could not run, keeps an image whose check
// was skipped, reads a page at a time with the fewest failed checks first, checks no further image once its time is up,
// and reports an image unchecked for over a day once
import { afterEach, expect, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import * as monitoring from "@carlnotes/server/monitoring"
import * as topicImageRenders from "./topicImages/topicImageRenders"
import { checkUncheckedImages } from "./uncheckedImageChecks"
import {
	CLEAN,
	FAILED,
	restoreUncheckedImageCheckTest,
	SKIPPED,
	stubUncheckedImageCheck,
	TWO_PUBLIC_TOPIC_ROWS,
	toUncheckedImageDeletes,
	toUncheckedTopicImageRow,
	UPLOADED_AT,
} from "./uncheckedImageCheckTestFixtures"

// the pool's own query and every spy, put back after each test
afterEach(restoreUncheckedImageCheckTest)

// a service that still fails costs one call a sweep and leaves every image unchecked
test("a check that could not run stops the batch after one call and raises that image's attempt count", async () => {
	const uncheckedImageRows = [
		toUncheckedTopicImageRow({ id: "unchecked-first" }),
		toUncheckedTopicImageRow({ id: "unchecked-second", subjectId: "topic-2" }),
		toUncheckedTopicImageRow({ id: "unchecked-third", subjectId: "topic-3" }),
	]
	const { sentQueries, classifyImageSpy } = stubUncheckedImageCheck({ uncheckedImageRows }, FAILED, CLEAN, CLEAN)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 0, isCheckUnavailable: true })

	// the page is read with the fewest failed checks first, then the earliest uploaded
	expect(sentQueries[0]?.text).toContain(
		'order by "unchecked_images"."attempt_count" asc, "unchecked_images"."uploaded_at" asc',
	)

	// one call, one raised attempt count on the first image by its id and time, and nothing deleted
	expect(classifyImageSpy).toHaveBeenCalledTimes(1)
	const attemptUpdates = sentQueries.filter(({ text }) => text.startsWith('update "unchecked_images"'))
	expect(attemptUpdates).toHaveLength(1)
	expect(attemptUpdates[0]?.text).toContain('"attempt_count" = "unchecked_images"."attempt_count" + 1')
	expect(attemptUpdates[0]?.values).toEqual(["unchecked-first", UPLOADED_AT.toISOString()])
	expect(toUncheckedImageDeletes(sentQueries)).toEqual([])
})

// a worker with no moderation key publishes nothing that is unchecked
test("a skipped check keeps the image unchecked, and the batch goes on to the next image", async () => {
	const uncheckedImageRows = [
		toUncheckedTopicImageRow({ id: "unchecked-first" }),
		toUncheckedTopicImageRow({ id: "unchecked-second", subjectId: "topic-2" }),
	]
	const { sentQueries, classifyImageSpy } = stubUncheckedImageCheck(
		{ uncheckedImageRows, topicRowById: TWO_PUBLIC_TOPIC_ROWS },
		SKIPPED,
		CLEAN,
	)
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 1, deletedCount: 0, isCheckUnavailable: false })

	// the first unchecked image stays with no attempt counted, and the second is checked and published
	expect(classifyImageSpy).toHaveBeenCalledTimes(2)
	expect(replaceTopicImageSpy.mock.calls.map(([replacedImage]) => replacedImage.topicId)).toEqual(["topic-2"])
	expect(toUncheckedImageDeletes(sentQueries).map(({ values }) => values[0])).toEqual(["unchecked-second"])
	expect(sentQueries.some(({ text }) => text.startsWith('update "unchecked_images"'))).toBe(false)
})

// the sweep reads the unchecked images a page at a time, and leaves out the ones it already read
test("a sweep with more unchecked images than a page reads the next page without the ones it read", async () => {
	const uncheckedImageRows = Array.from({ length: 21 }, (_, i) => toUncheckedTopicImageRow({ id: `unchecked-${i}` }))
	const { sentQueries, classifyImageSpy } = stubUncheckedImageCheck({ uncheckedImageRows })
	classifyImageSpy.mockResolvedValue(SKIPPED)
	await checkUncheckedImages()

	// a full page, the one unchecked image left, and an empty page that ends the batch
	const pageQueries = sentQueries.filter(({ text }) => text.includes("order by"))
	expect(pageQueries.map(({ values }) => values.length)).toEqual([1, 21, 22])
	expect(pageQueries[1]?.values.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => `unchecked-${i}`))
	expect(classifyImageSpy).toHaveBeenCalledTimes(21)
})

// a slow endpoint cannot keep one sweep checking for longer than the batch's time
test("a batch whose time is up checks no further image", async () => {
	const uncheckedImageRows = [
		toUncheckedTopicImageRow({ id: "unchecked-first" }),
		toUncheckedTopicImageRow({ id: "unchecked-second" }),
		toUncheckedTopicImageRow({ id: "unchecked-third" }),
	]
	const { classifyImageSpy } = stubUncheckedImageCheck({ uncheckedImageRows })

	// a clock that each check moves on by ninety seconds
	let clockMs = Date.now()
	spyOn(Date, "now").mockImplementation(() => clockMs)
	classifyImageSpy.mockImplementation(async () => {
		clockMs += 90 * 1000
		return SKIPPED
	})

	// the third check would start three minutes in, past the batch's two
	await checkUncheckedImages()
	expect(classifyImageSpy).toHaveBeenCalledTimes(2)
})

// an image unchecked for over a day is reported once, by its subject alone, whatever its check finds
test("an image unchecked for over a day is reported once and never again", async () => {
	const longAgo = new Date(Date.now() - 2 * DAY_MS)
	const uncheckedImageRows = [
		toUncheckedTopicImageRow({ id: "unchecked-unreported", uploadedAt: longAgo }),
		toUncheckedTopicImageRow({
			id: "unchecked-reported",
			subjectId: "topic-2",
			uploadedAt: longAgo,
			reportedAt: longAgo,
		}),
	]
	const { sentQueries, classifyImageSpy } = stubUncheckedImageCheck(
		{ uncheckedImageRows, topicRowById: TWO_PUBLIC_TOPIC_ROWS },
		SKIPPED,
		SKIPPED,
	)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	await checkUncheckedImages()

	// both unchecked images are reached, and the one report names the subject's kind and id of the one not yet reported
	expect(classifyImageSpy).toHaveBeenCalledTimes(2)
	const longUncheckedImageReports = reportErrorSpy.mock.calls.filter(([error]) =>
		String(error).includes("unchecked for over a day"),
	)
	expect(longUncheckedImageReports).toHaveLength(1)
	expect(longUncheckedImageReports[0]?.[2]).toEqual({
		uncheckedImageSubjectKind: "topicImage",
		uncheckedImageSubjectId: "topic-1",
	})

	// its row alone is marked as reported, by its id and the time it was uploaded
	const reportedUpdates = sentQueries.filter(({ text }) => text.includes('set "reported_at"'))
	expect(reportedUpdates).toHaveLength(1)
	expect(reportedUpdates[0]?.values.slice(1)).toEqual(["unchecked-unreported", longAgo.toISOString()])
})
