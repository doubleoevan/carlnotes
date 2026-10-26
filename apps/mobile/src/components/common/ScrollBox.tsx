import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from "react"
import { Animated, type ScrollView as NativeScrollView, View } from "react-native"
import { NativeViewGestureHandler, ScrollView } from "react-native-gesture-handler"
import { CopyMarkdownButton } from "./CopyMarkdownButton"

// animate the highlighted thumb on the native driver as the inner view scrolls
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView)

/**
 * Keeps a long note within the web's bordered height, with native scrolling and a visible copy action.
 */
export function ScrollBox({
	children,
	copyMarkdown,
	scrollToTopOn,
}: {
	children: ReactNode
	copyMarkdown?: string
	scrollToTopOn?: unknown
}) {
	// measure overflow without updating React state on every scroll frame
	const scrollRef = useRef<ComponentRef<typeof NativeScrollView>>(null)
	const scrollY = useRef(new Animated.Value(0)).current
	const [viewportHeight, setViewportHeight] = useState(0)
	const [contentHeight, setContentHeight] = useState(0)
	const trackHeight = Math.max(0, viewportHeight - 8)
	const thumbHeight = Math.min(trackHeight, Math.max(24, (trackHeight * viewportHeight) / Math.max(1, contentHeight)))
	const isOverflowing = contentHeight > viewportHeight + 1 && viewportHeight > 0
	const translateY = scrollY.interpolate({
		inputRange: [0, Math.max(1, contentHeight - viewportHeight)],
		outputRange: [0, trackHeight - thumbHeight],
		extrapolate: "clamp",
	})

	// reset when the caller opens different notes in the same box
	// biome-ignore lint/correctness/useExhaustiveDependencies: the value triggers the reset through the ref
	useEffect(() => {
		scrollRef.current?.scrollTo({ y: 0, animated: false })
		scrollY.setValue(0)
	}, [scrollToTopOn, scrollY])
	return (
		<View className="relative rounded-md border border-primary/50">
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
					contentContainerStyle={{ padding: 8, paddingRight: copyMarkdown ? 36 : 8 }}
				>
					{children}
				</AnimatedScrollView>
			</NativeViewGestureHandler>
			{/* keep the web's orange overflow cue visible without intercepting touch or accessibility */}
			{isOverflowing ? (
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					className="absolute top-1 right-0.5 bottom-1 w-1.5"
				>
					<Animated.View
						className="w-1.5 rounded-full bg-primary/70"
						style={{ height: thumbHeight, transform: [{ translateY }] }}
					/>
				</View>
			) : null}
			{copyMarkdown ? <CopyMarkdownButton markdown={copyMarkdown} /> : null}
		</View>
	)
}
