// the updates list: the unread Findings a signed-in user should read next, trimmed to a reading budget
import type { TopicFinding } from "./findings"

// the reading budgets a list can hold, in minutes
export const UPDATES_MINUTES = [5, 15, 30] as const

export type UpdatesMinutes = (typeof UPDATES_MINUTES)[number]

// the budget of a list that names no length
export const DEFAULT_UPDATES_MINUTES: UpdatesMinutes = 15

// the most characters an opener holds
export const UPDATES_OPENER_MAX_CHARS = 280

// the heading of the updates MCP view
export const UPDATES_TITLE = "Brew Updates"

// what a list with no Findings reads as
export const EMPTY_UPDATES_TEXT = "Nothing new worth your time. Carl checked. Twice."

// a list's Finding, with the Topic it came from and the minutes it takes
export type UpdatesFinding = TopicFinding & {
	topicId: string
	topicName: string
	topicPath: string
	readingMinutes: number
}

// a built list: carl's opener, or null without one, the Findings in ranked order, and what did not fit. the more
// path opens the home page, or the Topic's page in a scoped list
export type Updates = {
	opener: string | null
	findings: UpdatesFinding[]
	moreCount: number
	morePath: string
}
