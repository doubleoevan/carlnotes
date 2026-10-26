// the mobile implementation of the Nightshift Button. the contract's classes go on a Pressable and its label, with the
// pressed states and the touch target only mobile needs
import { cn } from "@carlnotes/nightshift/classNames"
import {
	type ButtonSharedProps,
	type ButtonSize,
	type ButtonVariant,
	buttonBoxVariants,
	buttonDefaults,
	buttonHeightsRem,
	buttonTextVariants,
} from "@carlnotes/nightshift/components/button"
import { toPixels } from "@carlnotes/nightshift/units"
import { Slot } from "@rn-primitives/slot"
import { type ComponentRef, type Ref, useState } from "react"
import { type GestureResponderEvent, Platform, Pressable, type PressableProps } from "react-native"
import { TextClassContext } from "./text"

// the mobile class on every button, a row in place of the web's inline layout
const MOBILE_BUTTON_CLASS = "flex-row"

// the mobile classes on every label. a label shrinks to wrap beside an icon instead of pushing the row past the
// button, and a wrapped label stays centered
const MOBILE_BUTTON_TEXT_CLASS = "shrink text-center"

// each variant's pressed fill in place of the web's hover
const MOBILE_BUTTON_VARIANT_CLASSES = {
	default: "active:bg-primary/90",
	destructive: "active:bg-destructive/90",
	outline: "active:bg-input/50",
	secondary: "active:bg-secondary/80",
	ghost: "active:bg-accent dark:active:bg-accent/50",
	link: "",
} satisfies Record<ButtonVariant, string>

// each variant's label classes while the button is pressed. Uniwind reads no group variant on native
const MOBILE_BUTTON_PRESSED_TEXT_CLASSES = {
	default: "",
	destructive: "",
	outline: "text-accent-foreground",
	secondary: "",
	ghost: "text-accent-foreground",
	link: "underline",
} satisfies Record<ButtonVariant, string>

// each label size draws the web's height as a minimum, so the button grows with its label at a larger system text
// size. an icon size keeps the contract's square
const MOBILE_BUTTON_SIZE_CLASSES = {
	default: "h-auto min-h-9",
	sm: "h-auto min-h-8",
	lg: "h-auto min-h-10",
	icon: "",
	"icon-sm": "",
	"icon-lg": "",
} satisfies Record<ButtonSize, string>

// the touch target every size reaches through its hit slop, in points
const TOUCH_TARGET_SIZE = Platform.OS === "android" ? 48 : 44

/**
 * Returns a Button size's drawn height in points, the web's height for that size.
 */
export function toButtonHeight(sizeName: ButtonSize): number {
	return toPixels(buttonHeightsRem[sizeName])
}

/**
 * Returns the hit slop on every side that grows a drawn height to the platform touch target.
 */
export function toTouchTargetHitSlop(drawnHeight: number): number {
	return Math.max(0, (TOUCH_TARGET_SIZE - drawnHeight) / 2)
}

/**
 * A mobile Button's props: the pressable's, without the role and the hit slop the Button sets, with the shared ones and
 * the label the screen reader reads.
 */
export type ButtonProps = Omit<PressableProps, "accessibilityRole" | "role" | "hitSlop"> &
	ButtonSharedProps & { accessibilityLabel: string; ref?: Ref<ComponentRef<typeof Pressable>> }

/**
 * A button in one of the contract's variants and sizes, with the button role and a required label. Pass asChild to
 * give its classes and press to the child instead.
 */
export function Button({ className, variant, size, asChild = false, onPressIn, onPressOut, ...props }: ButtonProps) {
	// the variant and size with the contract's defaults, whether a finger is on the button, and the element that draws
	// the button
	const variantName = variant ?? buttonDefaults.variant
	const sizeName = size ?? buttonDefaults.size
	const [isPressed, setIsPressed] = useState(false)
	const Component = asChild ? Slot : Pressable

	// the hit slop on every side that grows the size's drawn height to the touch target
	const hitSlop = toTouchTargetHitSlop(toButtonHeight(sizeName))

	// track the press for the label's pressed classes, beside the caller's own press handlers
	const handlePressIn = (event: GestureResponderEvent): void => {
		setIsPressed(true)
		onPressIn?.(event)
	}
	const handlePressOut = (event: GestureResponderEvent): void => {
		setIsPressed(false)
		onPressOut?.(event)
	}

	// pass the label's classes down through the context, and put the box's classes on the pressable
	const textClassName = cn(
		buttonTextVariants({ variant: variantName }),
		MOBILE_BUTTON_TEXT_CLASS,
		isPressed && MOBILE_BUTTON_PRESSED_TEXT_CLASSES[variantName],
	)
	const boxClassName = cn(
		buttonBoxVariants({ variant: variantName, size: sizeName }),
		MOBILE_BUTTON_CLASS,
		MOBILE_BUTTON_VARIANT_CLASSES[variantName],
		MOBILE_BUTTON_SIZE_CLASSES[sizeName],
		className,
	)
	return (
		<TextClassContext.Provider value={textClassName}>
			<Component
				{...props}
				accessibilityRole="button"
				className={boxClassName}
				hitSlop={hitSlop}
				onPressIn={handlePressIn}
				onPressOut={handlePressOut}
			/>
		</TextClassContext.Provider>
	)
}
