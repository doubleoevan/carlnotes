import { cn } from "@carlnotes/nightshift/classNames"
import { FIELD_CLASS } from "@carlnotes/nightshift/field"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import * as SelectPrimitive from "@rn-primitives/select"
import { Check, ChevronDown } from "lucide-react-native"
import { type ComponentProps, Fragment, type ReactNode, useRef, useState } from "react"
import { Animated, Keyboard, Platform, StyleSheet, useWindowDimensions, View } from "react-native"
import { FullWindowOverlay } from "react-native-screens"
import { ScrollIndicator } from "@/components/common/ScrollIndicator"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { Icon } from "./icon"
import { TextClassContext } from "./text"

// the registry's primitive owns anchoring, collision handling, selection, and dismissal
export const Select: typeof SelectPrimitive.Root = SelectPrimitive.Root
const OverlayContainer = Platform.OS === "ios" ? FullWindowOverlay : Fragment

/**
 * Shows the current option using the body font.
 */
export function SelectValue({ className, ...props }: ComponentProps<typeof SelectPrimitive.Value>) {
	return (
		<SelectPrimitive.Value
			className={cn("text-sm text-foreground", className)}
			style={{ fontFamily: fontFamilies.sans.name }}
			{...props}
		/>
	)
}

/**
 * Opens an anchored dropdown with the shared field styling and a native touch target.
 */
export function SelectTrigger({
	className,
	children,
	...props
}: Omit<ComponentProps<typeof SelectPrimitive.Trigger>, "children"> & { children?: ReactNode }) {
	return (
		<SelectPrimitive.Trigger
			className={cn(
				FIELD_CLASS,
				"min-h-12 flex-row items-center justify-between gap-2 rounded-md border px-3 py-2",
				props.disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			{children}
			<Icon as={ChevronDown} className="size-4 text-muted-foreground" />
		</SelectPrimitive.Trigger>
	)
}

/**
 * Places the menu beside its trigger and dismisses it when the backdrop is pressed.
 */
export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
	// bound long menus to the safe viewport and retain the orange overflow cue
	const { height } = useWindowDimensions()
	const isKeyboardVisible = useIsKeyboardVisible()
	const scrollOffset = useRef(new Animated.Value(0)).current
	const [viewportHeight, setViewportHeight] = useState(0)
	const [contentHeight, setContentHeight] = useState(0)
	const keyboardTop = isKeyboardVisible ? Keyboard.metrics()?.screenY : undefined
	const menuInsets = {
		...props.insets,
		bottom: Math.max(props.insets?.bottom ?? 0, keyboardTop === undefined ? 0 : height - keyboardTop),
	}
	const safeHeight = Math.max(0, height - (menuInsets.top ?? 0) - menuInsets.bottom)
	return (
		<SelectPrimitive.Portal>
			<OverlayContainer>
				<SelectPrimitive.Overlay style={StyleSheet.absoluteFill}>
					<TextClassContext.Provider value="text-popover-foreground">
						<SelectPrimitive.Content
							position="popper"
							sideOffset={4}
							className={cn("min-w-24 rounded-md border border-border bg-popover p-1 shadow-raised", className)}
							{...props}
							insets={menuInsets}
						>
							<Animated.ScrollView
								style={{ maxHeight: Math.min(320, safeHeight / 2) }}
								keyboardShouldPersistTaps="handled"
								nestedScrollEnabled
								showsVerticalScrollIndicator={false}
								onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
								onContentSizeChange={(_, contentHeight) => setContentHeight(contentHeight)}
								onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollOffset } } }], {
									useNativeDriver: true,
								})}
								scrollEventThrottle={16}
							>
								{children}
							</Animated.ScrollView>
							<ScrollIndicator scrollOffset={scrollOffset} viewportSize={viewportHeight} contentSize={contentHeight} />
						</SelectPrimitive.Content>
					</TextClassContext.Provider>
				</SelectPrimitive.Overlay>
			</OverlayContainer>
		</SelectPrimitive.Portal>
	)
}

/**
 * Selects an option and shows a checkmark beside the current value.
 */
export function SelectItem({
	className,
	children,
	...props
}: Omit<ComponentProps<typeof SelectPrimitive.Item>, "children"> & { children?: ReactNode }) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"min-h-12 flex-row items-center gap-3 rounded-sm px-2 py-2 active:bg-accent",
				props.disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			{children ?? (
				<SelectPrimitive.ItemText
					className="flex-1 text-sm text-foreground"
					style={{ fontFamily: fontFamilies.sans.name }}
				/>
			)}
			<View className="size-4">
				<SelectPrimitive.ItemIndicator>
					<Icon as={Check} className="size-4 text-primary" />
				</SelectPrimitive.ItemIndicator>
			</View>
		</SelectPrimitive.Item>
	)
}
