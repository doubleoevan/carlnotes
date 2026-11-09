// the web implementation of the Nightshift Card: the contract's raised surface as a div, with an optional link
import { cn } from "@carlnotes/nightshift/classNames"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { ComponentProps } from "react"

/**
 * A raised card surface. Its body is the padded column inside it.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn(cardClasses.root, className)} {...props} />
}

/**
 * The padded column inside a Card.
 */
export function CardBody({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex flex-col", cardClasses.body, className)} {...props} />
}
