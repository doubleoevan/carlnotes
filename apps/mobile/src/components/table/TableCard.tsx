import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { View } from "react-native"

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
