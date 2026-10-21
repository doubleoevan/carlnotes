// an element the server renders is never hidden, so a page's content shows before any script runs or any scroll
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { useRevealClassName } from "./useRevealClassName"

// a section that takes the class the hook returns
function RevealedSection({ isAnimatedOnServer }: { isAnimatedOnServer: boolean }) {
	const { ref, revealClassName } = useRevealClassName<HTMLDivElement>({ isAnimatedOnServer })
	return (
		<div ref={ref} className={revealClassName}>
			Carl's notes
		</div>
	)
}

// a section below the first screen is simply shown, and a top one plays its animation from the server's HTML
test("a server-rendered element is shown before any script runs", () => {
	const shownHtml = renderToStaticMarkup(<RevealedSection isAnimatedOnServer={false} />)
	const animatedHtml = renderToStaticMarkup(<RevealedSection isAnimatedOnServer />)
	expect(shownHtml).toBe("<div>Carl&#x27;s notes</div>")
	expect(animatedHtml).toContain('class="animate-hydrate"')
	expect(animatedHtml).not.toContain("opacity-0")
})
