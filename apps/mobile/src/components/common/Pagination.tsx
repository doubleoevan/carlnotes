import { Pagination as SharedPagination } from "@carlnotes/core/components/Pagination"
import { cn } from "@carlnotes/nightshift/classNames"
import { paginationClasses } from "@carlnotes/nightshift/pagination"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Renders the web's page slots with native touch targets and selected-page announcements.
 */
export function Pagination({
	label,
	pageNumber,
	pageCount,
	onOpenPage,
}: {
	label: string
	pageNumber: number
	pageCount: number
	onOpenPage: (pageNumber: number) => void
}) {
	if (pageCount <= 1) {
		return null
	}
	return (
		<View accessibilityLabel={label} className="flex-row flex-wrap items-center justify-center gap-1 pt-2">
			<SharedPagination
				label={label}
				pageNumber={pageNumber}
				pageCount={pageCount}
				components={{
					renderControl: ({ pageNumber: targetPage, kind, label: controlLabel, isCurrentPage, isDisabled }) => {
						// native labels take the same state colors as the web control's container
						const colors = isCurrentPage ? paginationClasses.current : paginationClasses.idle
						return (
							<Button
								variant="outline"
								size="icon-lg"
								className={cn(colors.box, isCurrentPage ? "active:bg-primary" : "active:bg-card")}
								accessibilityLabel={controlLabel}
								accessibilityState={{ selected: isCurrentPage }}
								disabled={isDisabled}
								onPress={() => onOpenPage(targetPage)}
							>
								{kind === "page" ? (
									<Text className={colors.text}>{targetPage}</Text>
								) : (
									<Icon as={kind === "previous" ? ChevronLeft : ChevronRight} className={colors.text} />
								)}
							</Button>
						)
					},
					renderGap: () => (
						<Text className="w-10 text-center text-muted-foreground" accessibilityElementsHidden>
							…
						</Text>
					),
				}}
			/>
		</View>
	)
}
