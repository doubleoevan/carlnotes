// the web's implementation of the Nightshift Badge: the contract's classes, and the web's inline layout and icon size
// on top
import { cn } from "@carlnotes/nightshift/classNames"
import {
	type BadgeSharedProps,
	type BadgeVariant,
	type BadgeVariantProps,
	badgeBoxVariants,
	badgeDefaults,
	badgeTextVariants,
} from "@carlnotes/nightshift/components/badge"
import { Slot } from "@radix-ui/react-slot"
import type * as React from "react"

// the web's classes on every badge: the inline layout that hugs its label, one line, and the icon rules
const WEB_BADGE_CLASS = "inline-flex w-fit whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3"

// each variant's web classes, empty for all three. a variant the contract adds fails the type check here
const WEB_BADGE_VARIANT_CLASSES = {
	default: "",
	secondary: "",
	outline: "",
} satisfies Record<BadgeVariant, string>

// a badge's variant, and the classes the caller adds
type BadgeVariantsOptions = BadgeVariantProps & { className?: string }

/**
 * Returns a badge's classes.
 */
function badgeVariants({ variant, className }: BadgeVariantsOptions = {}): string {
	const variantName = variant ?? badgeDefaults.variant
	return cn(
		badgeBoxVariants({ variant: variantName }),
		badgeTextVariants({ variant: variantName }),
		WEB_BADGE_CLASS,
		WEB_BADGE_VARIANT_CLASSES[variantName],
		className,
	)
}

// a small pill. pass asChild to render it as a link or button
type BadgeProps = React.ComponentProps<"span"> & BadgeSharedProps
function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
	const Component = asChild ? Slot : "span"
	return <Component data-slot="badge" className={badgeVariants({ variant, className })} {...props} />
}

export { Badge, badgeVariants }
