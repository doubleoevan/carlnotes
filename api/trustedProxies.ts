// the proxies from TRUSTED_PROXIES whose x-forwarded-for may be trusted, as comma-separated IPs or CIDR ranges,
// one entry per hop. until it is set, the forwarded header is ignored and rate limiting shares one bucket
export const trustedProxies = (Bun.env.TRUSTED_PROXIES ?? "")
	.split(",")
	.map((trustedProxy) => trustedProxy.trim())
	.filter(Boolean)
