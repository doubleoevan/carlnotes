// what the stories' play functions share: the finds that wait for an element to fade in, the focus a mouse click
// leaves in a dialog, and the play context's type
import { expect, screen, waitFor } from "storybook/test"

/**
 * The context a story's play function receives, with that story's own args.
 */
export type StoryPlayContext<TStory extends { play?: (...args: never[]) => unknown }> = Parameters<
	NonNullable<TStory["play"]>
>[0]

/**
 * Returns the element the role query finds, once it is visible. A popover, menu, or dialog fades in after the click
 * that opens it.
 */
export async function findVisibleByRole(...findArgs: Parameters<typeof screen.findByRole>): Promise<HTMLElement> {
	return toVisibleElement(await screen.findByRole(...findArgs))
}

/**
 * Returns the element the text query finds, once it is visible, for text inside a popover, menu, or dialog that fades
 * in.
 */
export async function findVisibleByText(...findArgs: Parameters<typeof screen.findByText>): Promise<HTMLElement> {
	return toVisibleElement(await screen.findByText(...findArgs))
}

// waits for a found element's fade to end, then returns it
async function toVisibleElement(element: HTMLElement): Promise<HTMLElement> {
	await waitFor(() => expect(element).toBeVisible())
	return element
}

/**
 * Waits for the open dialog to hold the focus, then focuses the same element again without the focus ring, as a mouse
 * click leaves it.
 */
export async function showMouseFocus(): Promise<void> {
	// wait for the dialog to focus an element inside it. a frame without the window's focus, as a docs page's sibling
	// dialog frames leave each other, shows no focus ring to take off
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(!document.hasFocus() || dialog.contains(document.activeElement)).toBe(true))
	if (!document.hasFocus()) {
		return
	}

	// a story frame has no pointer input, so the browser shows the ring as if a key had moved the focus. focus the same
	// element again with the ring off, without scrolling
	const focusedElement = document.activeElement as HTMLElement
	focusedElement.blur()
	focusedElement.focus({ focusVisible: false, preventScroll: true })
}
