import type { ReactNode } from "react"
import { STRETCHED_CARD_LINK_CLASS } from "@/lib/styleClasses"
import { openMcpViewLink, toMcpViewSiteUrl } from "./mcpViewHost"

/**
 * A card's title link stretched over the whole card, which opens the card in the MCP view, or its page on the site
 * through the host if the card has no onOpen.
 */
export function McpViewCardLink({
	path,
	label,
	onOpen,
	children,
}: {
	path: string
	label: string
	onOpen?: () => void
	children: ReactNode
}) {
	return (
		<a
			href={toMcpViewSiteUrl(path)}
			aria-label={label}
			className={STRETCHED_CARD_LINK_CLASS}
			onClick={(event) => {
				event.preventDefault()
				if (onOpen) {
					onOpen()
					return
				}
				void openMcpViewLink(toMcpViewSiteUrl(path))
			}}
		>
			{children}
		</a>
	)
}
