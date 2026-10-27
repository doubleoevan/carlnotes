import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from "react"
import { Animated, type ScrollView as NativeScrollView, View } from "react-native"
import { NativeViewGestureHandler, ScrollView } from "react-native-gesture-handler"
import { CopyMarkdownButton } from "./CopyMarkdownButton"
import { ScrollIndicator } from "./ScrollIndicator"

// animate the highlighted thumb on the native driver as the inner view scrolls
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)

/**
 * Keeps a long note within the web's bordered height, with native scrolling and a visible copy action.
 */
export function ScrollBox({
	children,
	copyMarkdown,
	scrollToTopOn,
	actions,
}: {
	children: ReactNode
	copyMarkdown?: string
	scrollToTopOn?: unknown
	actions?: ReactNode
}) {
	// measure overflow without updating React state on every scroll frame
	const scrollRef = useRef<ComponentRef<typeof NativeScrollView>>(null)
	const scrollY = useRef(new Animated.Value(0)).current
	const [viewportHeight, setViewportHeight] = useState(0)
	const [contentHeight, setContentHeight] = useState(0)

	// reset when the caller opens different notes in the same box
	// biome-ignore lint/correctness/useExhaustiveDependencies: the value triggers the reset through the ref
	useEffect(() => {
		scrollRef.current?.scrollTo({ y: 0, animated: false })
		scrollY.setValue(0)
	}, [scrollToTopOn, scrollY])
	return (
		<View className="relative shrink rounded-md border border-primary/50">
			<NativeViewGestureHandler disallowInterruption>
				<AnimatedScrollView
					ref={scrollRef}
					style={{ maxHeight: 288 }}
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
					onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
					onContentSizeChange={(_, height) => setContentHeight(height)}
					onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
					scrollEventThrottle={16}
					contentContainerStyle={{ padding: 8, paddingRight: copyMarkdown && !actions ? 36 : 8 }}
				>
					{children}
				</AnimatedScrollView>
			</NativeViewGestureHandler>
			{/* keep the web's orange overflow cue visible without intercepting touch or accessibility */}
			<ScrollIndicator scrollOffset={scrollY} viewportSize={viewportHeight} contentSize={contentHeight} />
			{actions ? (
				<View className="flex-row justify-end gap-2 border-t border-border p-1.5">
					{copyMarkdown ? <CopyMarkdownButton markdown={copyMarkdown} isInline /> : null}
					{actions}
				</View>
			) : copyMarkdown ? (
				<CopyMarkdownButton markdown={copyMarkdown} />
			) : null}
		</View>
	)
}
