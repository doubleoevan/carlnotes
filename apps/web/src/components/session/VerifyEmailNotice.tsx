import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { Button } from "@/components/primitives/button"
import { SESSION_PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * The notice that follows a password signup. Verification is not a wall, so it offers a way straight into the app.
 */
export function VerifyEmailNotice({ email, redirectPath }: { email: string; redirectPath: string }) {
	return (
		<div className={cn(SESSION_PAGE_CLASS, "text-center")}>
			<CoffeeMug className="text-primary mx-auto size-10" />
			<h1 className="mt-4 text-2xl font-semibold">Check your email</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				{`We sent a link to confirm ${email}. You don't have to click it now. You can start using CarlNotes right away.`}
			</p>
			{/* a full page load, so useSession drops its cached signed-out state */}
			<Button onClick={() => (window.location.href = redirectPath)} className="mt-6">
				Continue to CarlNotes
			</Button>
		</div>
	)
}
