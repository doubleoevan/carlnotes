import type * as React from "react"

// the uppercase display-font label above each field. isRequired marks the field with a trailing asterisk
export function FieldLabel({ children, isRequired }: { children: React.ReactNode; isRequired?: boolean }) {
	return (
		<div className="text-muted-foreground font-display mb-1.5 text-xs tracking-wide uppercase">
			{children}
			{isRequired && <span className="text-destructive"> *</span>}
		</div>
	)
}
