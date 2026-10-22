import { useLocation } from "@tanstack/react-router"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { DocsLink } from "./DocsLink"

// one centered row of footer items that wraps, with a readable gap between items
const FOOTER_ROW_CLASS = "flex flex-wrap justify-center gap-x-6 gap-y-1"

/**
 * The global footer
 */
export function Footer() {
	return (
		<footer className="text-muted-foreground mx-auto max-w-5xl px-safe py-6 text-center text-sm">
			<FooterLegal />
			<p className="mt-2">Carl read all of it.</p>
		</footer>
	)
}

// the copyright and license line, the site link row, then the legal link row
function FooterLegal() {
	return (
		<div className="mt-3 space-y-1.5">
			{/* the copyright, the license, and the raccoon line */}
			<div className={FOOTER_ROW_CLASS}>
				<span>© 2026 CarlNotes</span>
				<span>AGPL-3.0 licensed.</span>
				<span>Take the code. Leave the raccoon.</span>
			</div>
			{/* the docs, the releases, the source, and the Nightshift component browser, which opens in a new tab like the docs */}
			<div className={FOOTER_ROW_CLASS}>
				<DocsLink className={STANDALONE_LINK_CLASS} />
				<FooterLink href="/releases">Releases</FooterLink>
				<FooterLink href="https://github.com/doubleoevan/carlnotes/blob/main/README.md">Source Code</FooterLink>
				<FooterLink href="/nightshift/" isNewTab>
					Nightshift Design System
				</FooterLink>
			</div>
			{/* the license and the legal pages */}
			<div className={FOOTER_ROW_CLASS}>
				<FooterLink href="https://github.com/doubleoevan/carlnotes/blob/main/LICENSE">License</FooterLink>
				<FooterLink href="/privacy">Privacy</FooterLink>
				<FooterLink href="/terms">Terms</FooterLink>
			</div>
		</div>
	)
}

// a footer link, underlined while its page is the one open. an external url never matches the open page
function FooterLink({ href, children, ...props }: React.ComponentProps<typeof AnchorLink>) {
	const pathname = useLocation({ select: (location) => location.pathname })
	return (
		<AnchorLink href={href} {...props} className={cn(STANDALONE_LINK_CLASS, pathname === href && "underline")}>
			{children}
		</AnchorLink>
	)
}
