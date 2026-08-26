// the webmail compose-email urls an invite is given

// one email provider's composer, and the address domains that suggest the user is on it
export type EmailProvider = {
	key: string
	label: string
	// the domains that put this email provider first in the row
	domains: string[]
	// a webmail composer opens in its own tab. the default mail client takes this one over instead
	opensInNewTab: boolean
	// the user's own address is passed to every builder. Outlook's composer differs by account kind
	toUrl: (subject: string, body: string, userEmail: string | null) => string
}

// the domains that mean that an Outlook account is personal instead of a workplace one
const OUTLOOK_CONSUMER_DOMAINS = ["outlook.com", "hotmail.com", "live.com", "msn.com"]

// the email providers the invite menu offers, plus the default mail client for everyone else.
export const EMAIL_PROVIDERS: EmailProvider[] = [
	{
		key: "gmail",
		opensInNewTab: true,
		label: "Gmail",
		domains: ["gmail.com", "googlemail.com"],
		toUrl: (subject, body) => `https://mail.google.com/mail/?view=cm&fs=1&su=${encode(subject)}&body=${encode(body)}`,
	},
	{
		// hotmail addresses are still in wide use, and their owners would not read an Outlook-only label as theirs
		key: "outlook",
		opensInNewTab: true,
		label: "Outlook / Hotmail",
		domains: OUTLOOK_CONSUMER_DOMAINS,
		toUrl: (subject, body, userEmail) => {
			// consumer and work accounts have different deep links
			const domain = toEmailDomain(userEmail)
			const host =
				!domain || OUTLOOK_CONSUMER_DOMAINS.includes(domain)
					? "https://outlook.live.com/mail/0"
					: "https://outlook.office.com/mail"
			return `${host}/deeplink/compose?subject=${encode(subject)}&body=${encode(body)}`
		},
	},
	{
		key: "yahoo",
		opensInNewTab: true,
		label: "Yahoo Mail",
		domains: ["yahoo.com", "ymail.com", "rocketmail.com"],
		toUrl: (subject, body) => `https://compose.mail.yahoo.com/?subject=${encode(subject)}&body=${encode(body)}`,
	},
	{
		key: "proton",
		opensInNewTab: true,
		label: "Proton Mail",
		domains: ["proton.me", "protonmail.com", "pm.me"],
		toUrl: (subject, body) =>
			`https://mail.proton.me/u/0/inbox?compose&subject=${encode(subject)}&body=${encode(body)}`,
	},
	{
		key: "mailto",
		opensInNewTab: false,
		label: "Email app",
		domains: [],
		toUrl: (subject, body) => `mailto:?subject=${encode(subject)}&body=${encode(body)}`,
	},
]

/**
 * The email providers in the order this user should see them, starting with the one their email address matches.
 */
export function toEmailProviders(userEmail: string | null | undefined): EmailProvider[] {
	// with no address to read, the row stays in its original order
	const domain = toEmailDomain(userEmail)
	if (!domain) {
		return EMAIL_PROVIDERS
	}

	// the email providers whose domains include this email address go first, and the other providers follow
	const matchedProviders = EMAIL_PROVIDERS.find((emailProvider) => emailProvider.domains.includes(domain))
	return matchedProviders
		? [matchedProviders, ...EMAIL_PROVIDERS.filter((provider) => provider !== matchedProviders)]
		: EMAIL_PROVIDERS
}

// the lowercased domain of an address, or undefined when there is none
function toEmailDomain(userEmail: string | null | undefined): string | undefined {
	return userEmail?.split("@")[1]?.toLowerCase()
}

// every email provider takes its subject and body inside a query string, so both are encoded the same way
function encode(value: string): string {
	return encodeURIComponent(value)
}
