// the web's implementation of the Nightshift Button, the contract's classes with the web's own classes on top
import { cn } from "@carlnotes/nightshift/classNames"
import {
	type ButtonSharedProps,
	type ButtonSize,
	type ButtonVariant,
	type ButtonVariantProps,
	buttonBoxVariants,
	buttonDefaults,
	buttonTextVariants,
} from "@carlnotes/nightshift/components/button"
import { Slot } from "@radix-ui/react-slot"
import type * as React from "react"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// the web's classes on every button: the inline layout, one line, the transition, the disabled and invalid states, the
// focus ring, and the icon rules
const WEB_BUTTON_CLASS =
	"inline-flex whitespace-nowrap transition-all disabled:pointer-events-none aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"

// each variant's hover, the destructive focus ring, and the link's standalone underline
const WEB_BUTTON_VARIANT_CLASSES = {
	default: "hover:bg-primary/90",
	destructive: "hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
	outline: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-input/50",
	secondary: "hover:bg-secondary/80",
	ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
	link: cn(STANDALONE_LINK_CLASS, "underline-offset-4"),
} satisfies Record<ButtonVariant, string>

// each label size's tighter side padding beside an icon
const WEB_BUTTON_SIZE_CLASSES = {
	default: "has-[>svg]:px-3",
	sm: "has-[>svg]:px-2.5",
	lg: "has-[>svg]:px-4",
	icon: "",
	"icon-sm": "",
	"icon-lg": "",
} satisfies Record<ButtonSize, string>

// a button's variant and size, and the classes the caller adds
type ButtonVariantsOptions = ButtonVariantProps & { className?: string }

/**
 * Returns a button's classes, for a Button or for a link drawn as one.
 */
export function buttonVariants({ variant, size, className }: ButtonVariantsOptions = {}): string {
	const variantName = variant ?? buttonDefaults.variant
	const sizeName = size ?? buttonDefaults.size
	return cn(
		buttonBoxVariants({ variant: variantName, size: sizeName }),
		buttonTextVariants({ variant: variantName }),
		WEB_BUTTON_CLASS,
		WEB_BUTTON_VARIANT_CLASSES[variantName],
		WEB_BUTTON_SIZE_CLASSES[sizeName],
		className,
	)
}

/**
 * A button in one of the contract's variants and sizes. Pass asChild to give its classes to the child instead.
 */
export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> & ButtonSharedProps) {
	const Component = asChild ? Slot : "button"
	return <Component data-slot="button" className={buttonVariants({ variant, size, className })} {...props} />
}
