import { cn } from "@carlnotes/nightshift/classNames"
import { CoffeeMug } from "./CoffeeMug"

/**
 * The loading state: a steaming coffee mug next to the loading line. It fills half the viewport for a page,
 * and a className shortens it where it sits inside a card. The coffee-loading class keeps the steam animation active on narrow screens.
 */
export function CoffeeLoading({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"coffee-loading text-muted-foreground font-display flex min-h-[50dvh] items-center justify-center gap-2 text-lg",
				className,
			)}
		>
			<CoffeeMug className="size-5" />
			Steeping…
		</div>
	)
}
