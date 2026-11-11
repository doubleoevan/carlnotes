import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"

/**
 * Gives native tables the web's shared card, border, and elevation.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<View className={cn("overflow-hidden rounded-lg border border-separator bg-card shadow-raised", className)}>
			{children}
		</View>
	)
}

/**
 * Shows an empty list or table's one muted line in the web's card, in its rows' place.
 */
export function EmptyListCard({
	text,
	children,
	className,
}: {
	// the plain line, in the card's own text style
	text?: string
	// a link or a button in the line's place, which brings its own style
	children?: ReactNode
	className?: string
}) {
	return (
		<TableCard className={cn("px-4 py-6", className)}>
			{text && <Text className="text-sm text-muted-foreground">{text}</Text>}
			{children}
		</TableCard>
	)
}

/**
 * Aligns a table's headings with its row cells.
 */
export function TableHeader({ children }: { children: ReactNode }) {
	return <View className="min-h-11 flex-row items-center gap-2 border-b border-separator-strong px-4">{children}</View>
}

/**
 * Keeps native table rows aligned with separators and room for scaled text.
 */
export function TableRow({ children, isLast = false }: { children: ReactNode; isLast?: boolean }) {
	return (
		<View className={cn("min-h-12 flex-row items-center gap-2 px-4 py-2", !isLast && "border-b border-separator")}>
			{children}
		</View>
	)
}
