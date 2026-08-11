import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"

/**
 * A password field with a reveal toggle. Shared by the session forms, the reset page, and the account page.
 */
export function PasswordInput({
	id,
	label,
	value,
	onChange,
	autoComplete,
}: {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
	autoComplete?: string
}) {
	const [isShown, setShown] = useState(false)
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			{/* the reveal button sits inside the field, so the input keeps room for it on the right */}
			<div className="relative">
				<Input
					id={id}
					type={isShown ? "text" : "password"}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					autoComplete={autoComplete}
					className="bg-card dark:bg-card pr-10"
					required
				/>
				<button
					type="button"
					onClick={() => setShown(!isShown)}
					aria-label={isShown ? "Hide password" : "Show password"}
					aria-pressed={isShown}
					className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex items-center rounded-md px-3 focus-visible:ring-2 focus-visible:outline-none"
				>
					{isShown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
		</div>
	)
}
