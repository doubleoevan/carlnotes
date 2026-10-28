import { expect, test } from "bun:test"
import { THINKING_LINES } from "@carlnotes/core/lib/thinkingLines"
import { renderTestHook } from "@/lib/hookTestHarness"
import { ThinkingLine } from "./ThinkingLine"

// changing presentation must not deal another phrase while a response is still pending
test("the shared thinking line keeps its phrase across web rerenders", async () => {
	// mount through the real web adapter and retain its visible phrase
	let className = "text-sm"
	const harness = await renderTestHook(
		() => null,
		() => <ThinkingLine className={className} />,
	)
	try {
		// verify the shared wording and existing browser shimmer
		const line = harness.container.textContent
		expect(THINKING_LINES.map((phrase) => `Carl is ${phrase}…`)).toContain(line)
		expect(harness.container.querySelector(".shimmer-text.text-sm")).not.toBeNull()

		// a parent change updates styling without replacing the selected line
		className = "text-xs"
		await harness.render()
		expect(harness.container.textContent).toBe(line)
		expect(harness.container.querySelector(".shimmer-text.text-xs")).not.toBeNull()
	} finally {
		await harness.close()
	}
})
