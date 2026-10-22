// the content security policy's shared frame sources and baseline directives, and the builder that ends every policy
// with the baseline directives

// the frames a page may load: this origin, YouTube's privacy-enhanced player, and Cloudflare's Turnstile challenge
export const FRAME_SOURCE_DIRECTIVE =
	"frame-src 'self' https://www.youtube-nocookie.com https://challenges.cloudflare.com"

// the directives that every policy includes: no plugin content, and a base url and a form's action that stay on this
// origin. base-uri and form-action never fall back to default-src, so every policy names them
export const BASELINE_POLICY_DIRECTIVES = ["object-src 'none'", "base-uri 'self'", "form-action 'self'"]

/**
 * Returns a Content-Security-Policy header value: the given directives, then the baseline directives.
 */
export function toContentSecurityPolicy(directives: string[]): string {
	return [...directives, ...BASELINE_POLICY_DIRECTIVES].join("; ")
}
