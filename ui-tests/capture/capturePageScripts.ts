// the scripts that a capture page runs before any of the component browser's own: Storybook's story events gathered
// into one render result, the render check, the clip measure, and seeded randomness. each function runs inside the
// page, so it reads nothing from this module
import type { AccessibilityResult } from "../imageCaptures"

/** What Storybook's events say about a story: an error with its text, or finished with its accessibility result. */
export type StoryRenderResult =
	| { status: "error"; errorText: string }
	| { status: "finished"; accessibilityResult: AccessibilityResult }

/** The globals that a story pins for itself: its viewport and its theme. */
export type StoryGlobals = { viewport?: { value?: string }; theme?: string }

// the globals that the scripts add to the page, and the channel that Storybook's preview sets
declare global {
	interface Window {
		// the story's render result and its own globals
		__uiTestsStoryRenderResult?: StoryRenderResult
		__uiTestsStoryGlobals?: StoryGlobals
		// the render check, the clip measure, and Storybook's channel
		__uiTestsReadRenderError: () => string | null
		__uiTestsMeasureClip: (clipPaddingPx: number) => { width: number; height: number }
		__STORYBOOK_ADDONS_CHANNEL__?: StorybookChannel
	}
}

// the part of Storybook's channel that the scripts listen on
type StorybookChannel = { on: (eventName: string, listener: (payload: unknown) => void) => void }

// the part of a story-finished report that the scripts read: its type, and an accessibility result's violations, each
// with its help text and the selector path of each element that breaks it
type FinishedReport = {
	type?: string
	result?: { violations?: { id: string; help: string; nodes: { target: unknown[] }[] }[] }
}

/** The seed that every capture page's randomness starts from. */
export const RANDOM_SEED = 20261001

/**
 * Replaces the page's random numbers with a seeded sequence, so a shuffle picks the same order on every image capture.
 */
export function seedRandomness(seed: number): void {
	// a small seeded generator, mulberry32
	let state = seed
	Math.random = () => {
		state = (state + 0x6d2b79f5) | 0
		let mixedState = Math.imul(state ^ (state >>> 15), 1 | state)
		mixedState = (mixedState + Math.imul(mixedState ^ (mixedState >>> 7), 61 | mixedState)) ^ mixedState
		return ((mixedState ^ (mixedState >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Listens to the Storybook preview's channel as soon as the preview sets it, and gathers its story events into one
 * render result on the window. Adds the render check and the clip measure beside it.
 */
export function installStoryEventHooks(): void {
	// the first error that a story raised, and the render result that the events reach
	let firstErrorText: string | null = null
	const recordError = (errorText: string): void => {
		firstErrorText ??= errorText
		window.__uiTestsStoryRenderResult = { status: "error", errorText: firstErrorText }
	}

	// the message of an error that the channel passes, each error's message for a list of errors, or the payload as text
	const toStorybookErrorText = (payload: unknown): string => {
		if (Array.isArray(payload)) {
			return payload.map((errorPayload) => toStorybookErrorText(errorPayload)).join(", ")
		}
		const errorPayload = payload as { message?: string; title?: string; description?: string } | null
		const titledText = errorPayload?.title ? `${errorPayload.title}: ${errorPayload.description ?? ""}` : null
		return errorPayload?.message ?? titledText ?? String(payload)
	}

	// the accessibility addon's report among the finished event's reports: its violations, each with its first few
	// elements, or no result
	const VIOLATION_NODE_LIMIT = 3
	const toAccessibilityResult = (reporters: unknown): AccessibilityResult => {
		const reports = (reporters ?? []) as FinishedReport[]
		const violations = reports.find((report) => report.type === "a11y")?.result?.violations
		if (!violations) {
			return { status: "not-available" }
		}

		// each violated rule with its node count
		return {
			status: "checked",
			violations: violations.map((violation) => ({
				ruleId: violation.id,
				help: violation.help,
				nodeCount: violation.nodes.length,
				nodeSelectors: violation.nodes.slice(0, VIOLATION_NODE_LIMIT).map((node) => node.target.join(" ")),
			})),
		}
	}

	// listen to every event that ends a story, the moment the preview sets its channel
	const listenToChannel = (channel: StorybookChannel): void => {
		// an error event of each kind
		channel.on("storyErrored", (payload) => recordError(toStorybookErrorText(payload)))
		channel.on("storyThrewException", (payload) => recordError(toStorybookErrorText(payload)))
		channel.on("playFunctionThrewException", (payload) =>
			recordError(`the play function threw: ${toStorybookErrorText(payload)}`),
		)
		channel.on("unhandledErrorsWhilePlaying", (payload) =>
			recordError(`the story raised: ${toStorybookErrorText(payload)}`),
		)
		channel.on("storyMissing", (payload) => recordError(`the component browser has no story ${String(payload)}`))
		channel.on("configError", (payload) =>
			recordError(`the component browser's preview failed: ${toStorybookErrorText(payload)}`),
		)

		// the globals that the story pins for itself, which Storybook sends before it renders the story
		channel.on("globalsUpdated", (payload) => {
			window.__uiTestsStoryGlobals = (payload as { storyGlobals?: StoryGlobals }).storyGlobals ?? {}
		})

		// the finished event, which includes the reports. a story already marked errored keeps its error
		channel.on("storyFinished", (payload) => {
			const finishedPayload = payload as { status?: string; reporters?: unknown }
			if (firstErrorText === null) {
				window.__uiTestsStoryRenderResult = {
					status: "finished",
					accessibilityResult: toAccessibilityResult(finishedPayload.reporters),
				}
			}
		})
	}

	// hold the channel that the preview sets, and listen to it
	let storybookChannel: StorybookChannel | undefined
	Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
		configurable: true,
		get: () => storybookChannel,
		set: (channel: StorybookChannel) => {
			storybookChannel = channel
			listenToChannel(channel)
		},
	})

	// an element of Storybook's own page, which is never part of a story
	const isStorybookElement = (element: Element): boolean =>
		element.id.startsWith("storybook-") ||
		[...element.classList].some((className) => className.startsWith("sb-")) ||
		["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)

	// the visible elements that a story opened outside its root, such as a dialog or a menu
	const toVisiblePortals = (): Element[] =>
		[...document.body.children].filter((element) => {
			const elementBox = element.getBoundingClientRect()
			return !isStorybookElement(element) && elementBox.width > 0 && elementBox.height > 0
		})

	// the error display that Storybook draws, or a story that rendered nothing at all
	window.__uiTestsReadRenderError = () => {
		// the error display's message
		if (document.body.classList.contains("sb-show-errordisplay")) {
			return document.getElementById("error-message")?.textContent?.trim() || "the component browser shows an error"
		}

		// an empty root with no portal open
		const storyRoot = document.getElementById("storybook-root")
		const isRootEmpty = !storyRoot || storyRoot.innerHTML.trim() === ""
		return isRootEmpty && toVisiblePortals().length === 0 ? "the story rendered nothing" : null
	}

	// the page's full width, and the height down to the lowest edge of the story or a portal, padded
	window.__uiTestsMeasureClip = (clipPaddingPx) => {
		// the lowest edge of the root and of each open portal
		const storyRoot = document.getElementById("storybook-root")
		const bottomEdges = [storyRoot?.getBoundingClientRect().bottom ?? 0]
		bottomEdges.push(...toVisiblePortals().map((element) => element.getBoundingClientRect().bottom))

		// padded, and never past the page's own height
		const pageElement = document.documentElement
		const contentHeight = Math.ceil(Math.max(...bottomEdges) + window.scrollY + clipPaddingPx)
		return { width: pageElement.scrollWidth, height: Math.max(1, Math.min(contentHeight, pageElement.scrollHeight)) }
	}
}
