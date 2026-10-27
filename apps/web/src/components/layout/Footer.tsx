import { type FooterElements, Footer as SharedFooter } from "@carlnotes/core/components/Footer"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// one centered row of footer items that wraps, with a readable gap between items
const FOOTER_ROW_CLASS = "flex flex-wrap justify-center gap-x-6 gap-y-1"

/**
 * The global footer
 */
export function Footer() {
	return <SharedFooter elements={FOOTER_ELEMENTS} />
}

// semantic web elements preserve the existing footer spacing and active-link treatment
const FOOTER_ELEMENTS: FooterElements = {
	Root: ({ children }) => (
		<footer className="text-muted-foreground mx-auto max-w-5xl px-safe py-6 text-center text-sm">{children}</footer>
	),
	Legal: ({ children }) => <div className="mt-3 space-y-1.5">{children}</div>,
	Row: ({ children }) => <div className={FOOTER_ROW_CLASS}>{children}</div>,
	Text: ({ children }) => <span>{children}</span>,
	Closing: ({ children }) => <p className="mt-2">{children}</p>,
	Link: FooterLink,
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
