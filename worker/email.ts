// send an email through Resend's HTTP API. a missing key or a failed send is logged, never thrown,
// so a bad address never fails the caller. headers carries extras like List-Unsubscribe when the caller sets them
export async function sendEmail(message: {
	to: string
	subject: string
	content: string
	headers?: Record<string, string>
}): Promise<void> {
	// without a key and a verified from-address, log and skip rather than send
	const apiKey = Bun.env.RESEND_API_KEY
	const fromEmail = Bun.env.RESEND_FROM_EMAIL
	if (!apiKey || !fromEmail) {
		console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send email")
		return
	}

	// post the email to Resend. a non-2xx response or a network error is logged, never thrown
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: fromEmail,
				to: message.to,
				subject: message.subject,
				html: message.content,
				headers: message.headers,
			}),
		})
		if (!response.ok) {
			console.error(`resend email to ${message.to} failed: ${response.status} ${await response.text()}`)
			return
		}

		// log the accepted message id, so a send that never lands can be traced in resend rather than guessed at
		const { id } = (await response.json()) as { id?: string }
		console.log(`resend accepted email to ${message.to} as ${id ?? "an unknown id"}`)
	} catch (error) {
		console.error(`resend email to ${message.to} threw`, error)
	}
}
