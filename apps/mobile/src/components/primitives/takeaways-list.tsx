import { cn } from "@carlnotes/nightshift/classNames"
import {
	type TakeawayRowContent,
	type TakeawaySkeletonProps,
	takeawaysListClasses,
	takeawaysSkeletonMetrics,
} from "@carlnotes/nightshift/components/takeaways-list"
import { type ReactNode, useState } from "react"
import { View } from "react-native"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { RatingWithFeedbackSkeleton } from "./rating-with-feedback"
import { Text } from "./text"

// line up the text and number with the web while the native feedback controls keep equal heights
const TEXT_ROW_CLASS = "flex-row items-start gap-2.5"
const NUMBER_CLASS = cn(takeawaysListClasses.text, "shrink-0 font-normal text-muted-foreground")
const BODY_CLASS = cn(takeawaysListClasses.text, "font-normal pb-1")
const CONTENT_CLASS = "min-w-0 flex-1"

/** Shows the same Nightshift card as the web and MCP Journal. */
export function TakeawaysList({ children, isLoading }: { children: ReactNode; isLoading: boolean }) {
	return (
		<View accessibilityState={{ busy: isLoading }} className={takeawaysListClasses.card}>
			{isLoading ? <SkeletonPulse>{children}</SkeletonPulse> : children}
		</View>
	)
}

/** Aligns the native feedback field with the takeaway text. */
export function TakeawayRow({
	text,
	itemNumber,
	isLast,
	children,
}: TakeawayRowContent & { text: string; children?: ReactNode }) {
	return (
		<View className={rowClass(Boolean(children), isLast)}>
			<View className={TEXT_ROW_CLASS}>
				<Text className={NUMBER_CLASS}>{itemNumber}</Text>
				<View className={CONTENT_CLASS}>
					<Text className={BODY_CLASS}>{text}</Text>
					{children}
				</View>
			</View>
		</View>
	)
}

/** Fills one bar per wrapped text line, including when the system font is larger. */
export function TakeawaySkeleton({ text, itemNumber, isLast, canRate = false }: TakeawaySkeletonProps) {
	// start with three lines until the previous text's wrapped line count is available
	const [lines, setLines] = useState({ count: 3, height: Number(takeawaysSkeletonMetrics.lineHeight) })
	const barInset = Math.max(0, (lines.height - takeawaysSkeletonMetrics.barHeight) / 2)
	const lineKeys = Array.from({ length: lines.count }, (_, line) => `line-${line}`)
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			className={rowClass(canRate, isLast)}
		>
			<View className={TEXT_ROW_CLASS}>
				<View className="relative shrink-0">
					<Text className={cn(NUMBER_CLASS, "opacity-0")}>{itemNumber}</Text>
					<View className={cn(takeawaysListClasses.skeletonBar, "absolute inset-x-0")} style={{ top: barInset }} />
				</View>
				<View className={CONTENT_CLASS}>
					{/* match the platform's actual wrapping instead of stretching a fixed set of bars */}
					<View className="relative overflow-hidden">
						{text ? (
							<Text
								className={cn(BODY_CLASS, "opacity-0")}
								onTextLayout={({ nativeEvent }) => {
									const [first, second] = nativeEvent.lines
									if (first) {
										// follow measured line spacing and skip duplicate layout notifications
										const height = second ? second.y - first.y : first.height
										const count = nativeEvent.lines.length
										setLines((previous) =>
											previous.height === height && previous.count === count ? previous : { count, height },
										)
									}
								}}
							>
								{text}
							</Text>
						) : (
							<View className="h-20" />
						)}
						<View className="absolute inset-x-0" style={{ top: barInset, gap: barInset * 2 }}>
							{lineKeys.map((lineKey) => (
								<View key={lineKey} className={takeawaysListClasses.skeletonBar} />
							))}
						</View>
					</View>
					{canRate && <RatingWithFeedbackSkeleton />}
				</View>
			</View>
		</View>
	)
}

// reserve the same insets in the loaded row and its skeleton
function rowClass(canRate: boolean, isLast: boolean): string {
	return cn(
		takeawaysListClasses.row,
		canRate ? takeawaysListClasses.feedbackInset : takeawaysListClasses.readOnlyInset,
		!isLast && "border-b border-dashed border-separator-strong",
	)
}
