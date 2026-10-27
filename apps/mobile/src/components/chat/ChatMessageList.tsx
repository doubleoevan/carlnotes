import { type ReactElement, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, View } from "react-native"
import { Text } from "@/components/primitives/text"
import { ScrollDownButton } from "./ScrollDownButton"

/**
 * Recycles messages while keeping a reader's older position and an explicit jump to the latest.
 */
export function ChatMessageList<T>({
	data,
	renderItem,
	keyExtractor,
	listRef,
	emptyText,
	header,
	footer,
	scrollTarget,
}: {
	data: T[]
	renderItem: (item: T, index: number) => ReactElement
	keyExtractor: (item: T) => string
	listRef: RefObject<FlatList<T> | null>
	emptyText: string
	header?: ReactElement
	footer?: ReactElement
	scrollTarget?: { key: string }
}) {
	// track the reader's position and the first loaded message independently
	const isAtBottomRef = useRef(true)
	const isUserScrollingRef = useRef(false)
	const handledScrollTargetRef = useRef(scrollTarget)
	const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const scrollRetryCountRef = useRef(0)
	const scrollTargetIndexRef = useRef(-1)
	const reversedMessages = useMemo(() => [...data].reverse(), [data])
	const scrollTargetIndex = scrollTarget
		? reversedMessages.findIndex((item) => keyExtractor(item) === scrollTarget.key)
		: -1
	scrollTargetIndexRef.current = scrollTargetIndex
	const firstKey = data[0] ? keyExtractor(data[0]) : null
	const previousFirstKeyRef = useRef(firstKey)
	const isPrependingRef = useRef(false)
	// preserve the visible message when earlier messages are prepended
	if (firstKey !== previousFirstKeyRef.current) {
		isPrependingRef.current =
			previousFirstKeyRef.current !== null && data.some((item) => keyExtractor(item) === previousFirstKeyRef.current)
		previousFirstKeyRef.current = firstKey
	}
	const [isAtBottom, setIsAtBottom] = useState(true)

	// cancel a pending jump when the reader leaves or chooses another position
	const handleCancelScrollRetry = useCallback((): void => {
		if (scrollRetryTimerRef.current !== null) {
			clearTimeout(scrollRetryTimerRef.current)
			scrollRetryTimerRef.current = null
		}
	}, [])
	useEffect(() => handleCancelScrollRetry, [handleCancelScrollRetry])

	// wait for native layout before following the latest measured message
	const handleFollowLatest = (): void => {
		requestAnimationFrame(() => {
			if (isAtBottomRef.current) {
				listRef.current?.scrollToOffset({ offset: 0, animated: false })
			}
		})
	}

	// treat a quoted-message jump as reading older history until the reader returns to the end
	useEffect(() => {
		if (!scrollTarget || handledScrollTargetRef.current === scrollTarget) {
			return
		}
		if (scrollTargetIndex >= 0) {
			handleCancelScrollRetry()
			scrollRetryCountRef.current = 0
			handledScrollTargetRef.current = scrollTarget
			isAtBottomRef.current = false
			listRef.current?.scrollToIndex({ index: scrollTargetIndex, animated: false })
		}
	}, [scrollTarget, scrollTargetIndex, listRef, handleCancelScrollRetry])
	return (
		<View className="flex-1">
			{/* messages */}
			<FlatList
				ref={listRef}
				inverted
				data={reversedMessages}
				renderItem={({ item, index }) => <View className="px-3 py-2">{renderItem(item, data.length - 1 - index)}</View>}
				keyExtractor={keyExtractor}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="interactive"
				maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 64 }}
				ListEmptyComponent={<Text className="p-3 text-sm text-muted-foreground">{emptyText}</Text>}
				ListHeaderComponent={footer}
				ListFooterComponent={header}
				onLayout={handleFollowLatest}
				onScroll={(event) => {
					const isScrollAtBottom = event.nativeEvent.contentOffset.y < 64
					// update the pinned position during user scrolling or at the latest message
					if (isUserScrollingRef.current || isScrollAtBottom) {
						isAtBottomRef.current = isScrollAtBottom
					}
					setIsAtBottom(isScrollAtBottom)
				}}
				onScrollBeginDrag={() => {
					// cancel a quoted-message jump when dragging begins
					isUserScrollingRef.current = true
					handleCancelScrollRetry()
				}}
				onScrollEndDrag={() => {
					isUserScrollingRef.current = false
				}}
				onMomentumScrollBegin={() => {
					isUserScrollingRef.current = true
				}}
				onMomentumScrollEnd={() => {
					isUserScrollingRef.current = false
				}}
				scrollEventThrottle={16}
				onContentSizeChange={() => {
					if (isPrependingRef.current) {
						isPrependingRef.current = false
						return
					}
					handleFollowLatest()
				}}
				onScrollToIndexFailed={({ index, averageItemLength }) => {
					// measure the target's neighborhood before retrying its exact position
					listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
					if (scrollRetryCountRef.current >= 100) {
						return
					}
					scrollRetryCountRef.current += 1
					scrollRetryTimerRef.current = setTimeout(() => {
						if (scrollTargetIndexRef.current >= 0) {
							listRef.current?.scrollToIndex({ index: scrollTargetIndexRef.current, animated: false })
						}
					}, 150)
				}}
			/>
			{/* latest message */}
			<ScrollDownButton
				isScrollDownShown={!isAtBottom}
				onScrollDown={() => {
					// jump to the latest message
					handleCancelScrollRetry()
					isAtBottomRef.current = true
					listRef.current?.scrollToOffset({ offset: 0, animated: false })
				}}
			/>
		</View>
	)
}
