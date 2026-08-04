import { CoffeeMug } from "@/components/branding/CoffeeMug"

/**
 * The page-level loading state: a steaming coffee mug next to "Loading…"
 */
export function CoffeeLoading() {
	return (
		<div className="text-muted-foreground font-display flex min-h-[50dvh] items-center justify-center gap-2 text-lg">
			<CoffeeMug className="size-5" />
			Loading…
		</div>
	)
}
