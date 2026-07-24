import type { ReactNode } from "react"
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
import { authClient } from "@/lib/authClient"
import { cn } from "@/lib/utils"

/**
 * The Sign-out dialog that shows a confirmation before signing out
 */
export function SignOutDialog({ className, children }: { className: string; children: ReactNode }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger className={className}>{children}</AlertDialogTrigger>
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
					<AlertDialogAction onClick={() => authClient.signOut()}>Sign out</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
