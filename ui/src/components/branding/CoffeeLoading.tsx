import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { cn } from "@/lib/utils"

/**
 * The loading state: a steaming coffee mug next to "Loading…". It fills half the viewport for a page
 * with a className shortens it for a smaller surface.
 */
export function CoffeeLoading({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"text-muted-foreground font-display flex min-h-[50dvh] items-center justify-center gap-2 text-lg",
				className,
			)}
		>
			<CoffeeMug className="size-5" />
			Loading…
		</div>
	)
}
