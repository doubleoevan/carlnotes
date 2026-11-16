import { toUtcDay } from "@carlnotes/contracts/time"
import { fetchPromptTemplate } from "./fetch"
import { writePrompt } from "./write"

/** Renders the current UTC day as trusted date context for the model. */
export async function loadCurrentDayContext(now = new Date()): Promise<string> {
	const { template } = await fetchPromptTemplate("current-day-context")
	return writePrompt(template, {}, { currentDay: toUtcDay(now) })
}
