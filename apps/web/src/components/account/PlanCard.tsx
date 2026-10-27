import {
	type PlanCardElements,
	type PlanCardProps,
	PlanCard as SharedPlanCard,
} from "@carlnotes/core/components/PlanCard"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { Check } from "lucide-react"
import { Button } from "@/components/primitives/button"

/**
 * Keeps the web plan card's DOM styling around the shared plan content.
 */
export function PlanCard(props: PlanCardProps) {
	const navigate = useNavigate()
	return (
		<SharedPlanCard
			{...props}
			elements={PLAN_CARD_ELEMENTS}
			onSignup={() => void navigate({ to: "/signup", search: { cta: "pricing" } })}
		/>
	)
}

// retain the shipped plan card classes, badge position, and action variants
const PLAN_CARD_ELEMENTS: PlanCardElements = {
	Card: ({ children, isHighlighted }) => (
		<section
			className={cn(
				"bg-card relative flex flex-col rounded-xl border p-6 shadow-raised",
				isHighlighted && "border-primary ring-primary/40 ring-2",
			)}
		>
			{children}
		</section>
	),
	Badge: ({ children }) => (
		<span className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap">
			{children}
		</span>
	),
	Title: ({ children }) => <h2 className="font-display text-lg capitalize">{children}</h2>,
	Tagline: ({ children }) => <p className="text-muted-foreground mt-1 text-sm">{children}</p>,
	Price: ({ price, billingNote }) => (
		<>
			<div className="mt-4">
				<span className="text-3xl font-bold">{price}</span>
				<span className="text-muted-foreground text-sm"> /month</span>
			</div>
			<p className="text-muted-foreground mt-1 text-xs">{billingNote}</p>
		</>
	),
	Quotas: ({ children }) => <ul className="mt-4 flex-1 space-y-2 text-sm">{children}</ul>,
	Quota: ({ label, isRaised }) => (
		<li className="flex items-start gap-2">
			<Check className="text-primary mt-0.5 size-4 shrink-0" />
			<span>
				{label}
				{isRaised && (
					<span className="bg-card border-card text-link ml-1.5 inline-flex items-center rounded-full border px-1.5 align-middle text-xs font-semibold shadow-raised">
						with Yearly plan
					</span>
				)}
			</span>
		</li>
	),
	Action: ({ label, isDisabled, isOutlined, onPress }) => (
		<Button
			variant={isOutlined ? "outline" : "default"}
			disabled={isDisabled}
			onClick={onPress}
			className="mt-6 w-full"
		>
			{label}
		</Button>
	),
}
