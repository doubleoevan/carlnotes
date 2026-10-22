// the router every story imports in place of TanStack Router. main.ts resolves @tanstack/react-router to this file. it
// is the framework's router mock, with every hook a spy, and its own Link. the framework's Link drops the ref a caller
// passes, so a tooltip around a link never finds its anchor, and it replaces the caller's onClick with its navigate
// action
import { useLinkProps, useLocation } from "@storybook/tanstack-react/react-router"
import type { MouseEvent, ReactNode, Ref } from "react"
import { fn } from "storybook/test"

export * from "@storybook/tanstack-react/react-router"

// the action a link click reports in place of a navigation, which would leave the story's route
const navigateAction = fn().mockName("navigate")

// the link's router options and anchor props, with the ref a tooltip trigger or another wrapper passes
type StoryLinkProps = Parameters<typeof useLinkProps>[0] & { ref?: Ref<Element>; children?: ReactNode }

/**
 * Renders the anchor the router's Link renders, with the caller's ref. A click runs the caller's onClick, then reports
 * the navigate action, unless the onClick prevented it.
 */
export function Link({ ref, children, onClick, ...linkOptions }: StoryLinkProps) {
	// the story's location, and the anchor's props from the router without its own click, which would navigate the
	// story's router
	const location = useLocation()
	const { onClick: _routerClick, ...anchorProps } = useLinkProps(linkOptions, ref)

	// run the caller's click, then report the navigation in its place, as the router's own click composes them
	const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
		onClick?.(event)
		if (event.defaultPrevented) {
			return
		}
		event.preventDefault()
		navigateAction({ to: linkOptions.to, from: location.href })
	}

	// the anchor, with its href named again so the linter sees a link instead of a static element with a click
	return (
		<a {...anchorProps} href={anchorProps.href} onClick={handleClick}>
			{children}
		</a>
	)
}
