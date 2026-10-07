// eval harness tests: the gate and its interval, and the rubric assertions
import { expect, test } from "bun:test"
import { toGateResult, toRubricAssertions } from "./evalHarness"

test("an eval below its gate is named below it, and a report-only eval never is", () => {
	// 10 of 12 is 83 percent, below a 90 percent gate, with an interval that holds the pass rate
	const belowGateResult = toGateResult({ passedRunCount: 10, runCount: 12, gatePassRate: 0.9 })
	expect(belowGateResult.isBelowGate).toBe(true)
	expect(belowGateResult.gateText).toBe("below its 90% gate")
	expect(belowGateResult.intervalLow).toBeLessThan(belowGateResult.passRate)
	expect(belowGateResult.intervalHigh).toBeGreaterThan(belowGateResult.passRate)

	// every run passed, so the rate clears a full gate and the interval stays inside 0 to 1
	const fullGateResult = toGateResult({ passedRunCount: 12, runCount: 12, gatePassRate: 1 })
	expect(fullGateResult.isBelowGate).toBe(false)
	expect(fullGateResult.intervalHigh).toBe(1)
	expect(fullGateResult.intervalLow).toBeGreaterThan(0.7)

	// a report-only eval has no gate to fall below, even at no passes
	const reportOnlyGateResult = toGateResult({ passedRunCount: 0, runCount: 6, gatePassRate: null })
	expect(reportOnlyGateResult).toMatchObject({ isBelowGate: false, gateText: "report only" })
})

test("a rubric assertion puts the output's shape before the rubric and the writer's material after it", () => {
	// build one rubric assertion, then check that the shape comes first and the material last
	const [rubricAssertion] = toRubricAssertions({
		outputShapeRubric: "The output is a reply.",
		caseRubrics: [{ metric: "stays short", rubric: " Fail a long reply. " }],
		materialLabel: "The question",
		material: { question: "Which grinder?" },
	})
	expect(rubricAssertion).toEqual({
		type: "llm-rubric",
		metric: "stays short",
		value: 'The output is a reply. Fail a long reply.\n\nThe question:\n{\n  "question": "Which grinder?"\n}',
	})
})
