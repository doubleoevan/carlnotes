// the Button contract: the variant and size names, the defaults, the shared props, and the classes both apps draw. each
// app's implementation adds the classes only its platform has, hover and focus on the web and pressed states on mobile
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPlatform } from "../componentPlatforms"
import { FIELD_CLASS } from "../field"

/** The apps that keep an implementation of Button. */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

/** The Button variants. */
export const buttonVariantNames = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const

/** A Button variant's name. */
export type ButtonVariant = (typeof buttonVariantNames)[number]

/** The Button sizes: three for a label, and three square ones for an icon. */
export const buttonSizeNames = ["default", "sm", "lg", "icon", "icon-sm", "icon-lg"] as const

/** A Button size's name. */
export type ButtonSize = (typeof buttonSizeNames)[number]

/** Each Button size's height in rem, which its box classes draw as h-* or size-*. */
export const buttonHeightsRem = {
	default: 2.25,
	sm: 2,
	lg: 2.5,
	icon: 2.25,
	"icon-sm": 2,
	"icon-lg": 2.5,
} satisfies Record<ButtonSize, number>

/** The variant and size a Button takes if none is given. */
export const buttonDefaults = { variant: "default", size: "default" } as const satisfies {
	variant: ButtonVariant
	size: ButtonSize
}

/**
 * The classes both apps draw on a Button's container: the layout, the corner, the dimmed disabled state, each
 * variant's fill, border, and raised shadow, and each size's height and padding.
 */
export const buttonBoxVariants = cva("shrink-0 items-center justify-center gap-2 rounded-md disabled:opacity-50", {
	variants: {
		variant: {
			default: "bg-primary shadow-raised",
			destructive: "bg-destructive dark:bg-destructive/40 shadow-raised",
			outline: `border shadow-raised ${FIELD_CLASS}`,
			secondary: "bg-secondary shadow-raised",
			ghost: "",
			link: "",
		} satisfies Record<ButtonVariant, string>,
		size: {
			default: "h-9 px-4 py-2",
			sm: "h-8 gap-1.5 px-3",
			lg: "h-10 px-6",
			icon: "size-9",
			"icon-sm": "size-8",
			"icon-lg": "size-10",
		} satisfies Record<ButtonSize, string>,
	},
	defaultVariants: buttonDefaults,
})

/**
 * The classes both apps draw on a Button's label: its size and weight, and each variant's text color.
 */
export const buttonTextVariants = cva("text-sm font-medium", {
	variants: {
		variant: {
			default: "text-primary-foreground",
			destructive: "text-white",
			outline: "",
			secondary: "text-secondary-foreground",
			ghost: "",
			link: "text-link",
		} satisfies Record<ButtonVariant, string>,
	},
	defaultVariants: { variant: buttonDefaults.variant },
})

/** A Button's variant and size. */
export type ButtonVariantProps = VariantProps<typeof buttonBoxVariants>

/** The props both apps' Buttons take. Each implementation adds its platform's event props. */
export type ButtonSharedProps = ButtonVariantProps & { disabled?: boolean; asChild?: boolean }
