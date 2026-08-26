import type { ReactNode } from "react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/primitives/alert-dialog"
import { buttonVariants } from "@/components/primitives/button"
import { cn } from "@/lib/utils"

/**
 * The Sign-out dialog that shows a confirmation before signing out
 */
export function SignOutDialog({
	className,
	children,
	open,
	onOpenChange,
}: {
	className?: string
	children?: ReactNode
	open?: boolean
	onOpenChange?: (isOpen: boolean) => void
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{/* a caller that opens this from its own state passes no trigger. the mobile menu does exactly that,
			    since a dialog nested inside a menu is dismissed by the same tap that opened it */}
			{children === undefined ? null : <AlertDialogTrigger className={className}>{children}</AlertDialogTrigger>}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Signing out?</AlertDialogTitle>
					<AlertDialogDescription>
						Carl doesn't have an off switch. He'll keep reading. He always does.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className={cn(buttonVariants({ variant: "secondary" }), "dark:bg-secondary border-0")}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							// a failed sign-out shows a toast
							const { error } = await authClient.signOut()
							if (error) {
								toast(`Carl could not sign you out. ${error.message ?? "Try again in a moment."}`)
								return
							}

							// reload the current page after signing out so the signed-in controls disappear
							window.location.reload()
						}}
					>
						Sign out
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
