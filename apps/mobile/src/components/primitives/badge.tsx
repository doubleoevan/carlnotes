// the mobile implementation of the Nightshift Badge. the contract's classes go on a View and its label, with the row
// layout and the border color only mobile needs
import { cn } from "@carlnotes/nightshift/classNames"
import {
	type BadgeSharedProps,
	type BadgeVariant,
	badgeBoxVariants,
	badgeDefaults,
	badgeTextVariants,
} from "@carlnotes/nightshift/components/badge"
import { Slot } from "@rn-primitives/slot"
import { View, type ViewProps } from "react-native"
import { TextClassContext } from "./text"

// the mobile classes on every badge, a row that hugs its label instead of stretching across a column
const MOBILE_BADGE_CLASS = "flex-row self-start"

// each variant's mobile classes. the outline adds the border color that the web's base layer gives
const MOBILE_BADGE_VARIANT_CLASSES = {
	default: "",
	secondary: "",
	outline: "border-border",
} satisfies Record<BadgeVariant, string>

/** A mobile Badge's props, the view's with the shared ones. */
export type BadgeProps = ViewProps & BadgeSharedProps

/**
 * A small pill for a tag or a source kind. Pass asChild to give its classes to the child instead.
 */
export function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
	// the variant, with the contract's default
	const variantName = variant ?? badgeDefaults.variant
	const Component = asChild ? Slot : View

	// pass the label's classes down through the context, and put the container's classes on the view
	const boxClassName = cn(
		badgeBoxVariants({ variant: variantName }),
		MOBILE_BADGE_CLASS,
		MOBILE_BADGE_VARIANT_CLASSES[variantName],
		className,
	)
	return (
		<TextClassContext.Provider value={badgeTextVariants({ variant: variantName })}>
			<Component className={boxClassName} {...props} />
		</TextClassContext.Provider>
	)
}
