// eval tests for the two ratios the README publishes, including empty denominators that would otherwise be NaN
import { expect, test } from "bun:test"
import { toPrecisionRecall } from "./eval-pipeline"

// the ordinary case: some hits, some misses, some missed relevant items
test("toPrecisionRecall counts hits against predictions and against labels", () => {
	// four items: one true positive, one false positive, one false negative, one true negative
	const predictions = [true, true, false, false]
	const labels = [true, false, true, false]

	// one of two predictions was right (0.5 precision), and one of two relevant items was found (0.5 recall)
	expect(toPrecisionRecall(predictions, labels)).toEqual({ precision: 0.5, recall: 0.5 })
})

// a pipeline that surfaces nothing has no precision to report and must not report NaN
test("toPrecisionRecall reports zero rather than NaN on an empty denominator", () => {
	// nothing predicted, so precision has no denominator: return zero
	expect(toPrecisionRecall([false, false], [true, false]).precision).toBe(0)

	// nothing labeled relevant, so recall has no denominator: return zero
	expect(toPrecisionRecall([true, false], [false, false]).recall).toBe(0)
})

// a perfect run reports both ratios at one, which is the shape a regression would break
test("toPrecisionRecall reports a perfect run as one", () => {
	expect(toPrecisionRecall([true, false, true], [true, false, true])).toEqual({ precision: 1, recall: 1 })
})
