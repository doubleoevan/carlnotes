import type { ComponentProps } from "react"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "./AnchorLink"

/**
 * The brand: the coffee mug and CarlNotes, as one link. The site header and the MCP view shell each style its two parts.
 */
export function BrandLink({
	mugClassName,
	nameClassName,
	...anchorLinkProps
}: Omit<ComponentProps<typeof AnchorLink>, "children" | "className"> & {
	mugClassName?: string
	nameClassName?: string
}) {
	return (
		<AnchorLink {...anchorLinkProps} className="flex items-center gap-2 rounded-md">
			<CoffeeMug className={mugClassName} />
			<span className={nameClassName}>CarlNotes</span>
		</AnchorLink>
	)
}
