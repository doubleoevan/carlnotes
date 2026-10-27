import {
	BottomSheetBackdrop,
	type BottomSheetBackdropProps,
	type BottomSheetBackgroundProps,
	BottomSheetModal,
	BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { X } from "lucide-react-native"
import type { ComponentRef } from "react"
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import { AccessibilityInfo, Animated, BackHandler, findNodeHandle, type ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useUniwind } from "uniwind"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { ScrollIndicator } from "./ScrollIndicator"

// sheets return screen-reader focus to the control that opened them
export type SheetProps = {
	title: string
	children: ReactNode
	onClose: () => void
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
	hasHighlightedScrollIndicator?: boolean
}

/**
 * Presents a themed, dismissible native sheet with safe insets and focus return.
 */
export function Sheet({ title, children, onClose, triggerRef, hasHighlightedScrollIndicator = false }: SheetProps) {
	// present once and let Android Back dismiss before navigating the screen
	const sheetRef = useRef<BottomSheetModal>(null)
	const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
	const titleRef = useRef<ComponentRef<typeof Text>>(null)
	const insets = useSafeAreaInsets()
	const { theme } = useUniwind()
	const scrollOffset = useRef(new Animated.Value(0)).current
	const [viewportHeight, setViewportHeight] = useState(0)
	const [contentHeight, setContentHeight] = useState(0)
	useEffect(() => {
		sheetRef.current?.present()
		const back = BackHandler.addEventListener("hardwareBackPress", () => {
			sheetRef.current?.dismiss()
			return true
		})
		return () => {
			// restore focus when a choice unmounts the sheet as well as after a swipe
			back.remove()
			const trigger = triggerRef?.current && findNodeHandle(triggerRef.current)
			if (trigger) {
				AccessibilityInfo.setAccessibilityFocus(trigger)
			}
		}
	}, [triggerRef])

	// restore the trigger only after the sheet has left the accessibility tree
	const handleDismiss = (): void => {
		onClose()
	}
	const handleChange = (index: number): void => {
		if (index < 0) {
			return
		}
		// reveal the scroll affordance after the sheet opens
		scrollRef.current?.flashScrollIndicators()
		const titleNode = titleRef.current && findNodeHandle(titleRef.current)
		if (titleNode) {
			AccessibilityInfo.setAccessibilityFocus(titleNode)
		}
	}
	return (
		<BottomSheetModal
			ref={sheetRef}
			stackBehavior="push"
			accessible={false}
			enablePanDownToClose
			onDismiss={handleDismiss}
			onChange={handleChange}
			topInset={insets.top}
			backdropComponent={SheetBackdrop}
			backgroundComponent={SheetBackground}
			handleComponent={SheetHandle}
		>
			<BottomSheetScrollView
				ref={scrollRef}
				showsVerticalScrollIndicator={!hasHighlightedScrollIndicator}
				showsHorizontalScrollIndicator={false}
				persistentScrollbar
				indicatorStyle={theme === "dark" ? "white" : "black"}
				onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
				onScroll={(event) => scrollOffset.setValue(event.nativeEvent.contentOffset.y)}
				onContentSizeChange={(_, height) => {
					// measure content and reveal its scroll indicator
					setContentHeight(height)
					scrollRef.current?.flashScrollIndicators()
				}}
				contentContainerStyle={{ padding: 16, paddingBottom: Math.max(16, insets.bottom) }}
				accessibilityViewIsModal
			>
				{/* the title and explicit close control */}
				<View className="mb-4 flex-row flex-wrap items-center justify-between gap-2">
					<Text
						ref={titleRef}
						accessibilityRole="header"
						style={toTypeRoleStyle("sectionHeading")}
						className="flex-1 pl-11 text-center text-popover-foreground"
					>
						{title}
					</Text>
					<Button
						variant="ghost"
						size="icon"
						accessibilityLabel={`Close ${title}`}
						onPress={() => sheetRef.current?.dismiss()}
					>
						<Icon as={X} />
					</Button>
				</View>
				<View className="w-full max-w-3xl self-center">{children}</View>
			</BottomSheetScrollView>
			{hasHighlightedScrollIndicator && (
				<ScrollIndicator scrollOffset={scrollOffset} viewportSize={viewportHeight} contentSize={contentHeight} />
			)}
		</BottomSheetModal>
	)
}

// use Nightshift's popover surface for the native sheet
function SheetBackground({ style }: BottomSheetBackgroundProps) {
	return <View style={style} className="rounded-t-xl bg-popover" />
}
function SheetHandle() {
	return (
		<View className="items-center py-3" accessible={false}>
			<View className="h-1 w-10 rounded-full bg-muted-foreground" />
		</View>
	)
}
function SheetBackdrop(props: BottomSheetBackdropProps) {
	return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
}
