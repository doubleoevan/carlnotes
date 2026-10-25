// the Badge contract: the variant names, the default, the shared props, and the classes both apps draw. each app's
// implementation adds the classes only its platform has
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPlatform } from "../componentPlatforms"

/** The apps that keep an implementation of Badge. */
export const platforms: ComponentPlatform[] = ["web", "mobile"]

/** The Badge variants. */
export const badgeVariantNames = ["default", "secondary", "outline"] as const

/** A Badge variant's name. */
export type BadgeVariant = (typeof badgeVariantNames)[number]

/** The variant a Badge takes if none is given. */
export const badgeDefaults = { variant: "default" } as const satisfies { variant: BadgeVariant }

/**
 * The classes both apps draw on a Badge's container: the layout, the round corner, the border, the padding, the raised
 * shadow, and each variant's fill.
 */
export const badgeBoxVariants = cva(
	"shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 shadow-raised",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary",
				secondary: "border-transparent bg-secondary",
				outline: "",
			} satisfies Record<BadgeVariant, string>,
		},
		defaultVariants: badgeDefaults,
	},
)

/**
 * The classes both apps draw on a Badge's label: its size and weight, and each variant's text color.
 */
export const badgeTextVariants = cva("text-xs font-medium", {
	variants: {
		variant: {
			default: "text-primary-foreground",
			secondary: "text-secondary-foreground",
			outline: "text-foreground",
		} satisfies Record<BadgeVariant, string>,
	},
	defaultVariants: badgeDefaults,
})

/** A Badge's variant. */
export type BadgeVariantProps = VariantProps<typeof badgeBoxVariants>

/** The props both apps' Badges take. */
export type BadgeSharedProps = BadgeVariantProps & { asChild?: boolean }
