// the Stripe client that web billing and the billing projection share
import Stripe from "stripe"

/**
 * Returns the Stripe client, requiring the secret key.
 */
export function stripe(): Stripe {
	const stripeSecretKey = Bun.env.STRIPE_SECRET_KEY
	if (!stripeSecretKey) {
		throw new Error("STRIPE_SECRET_KEY must be set to reach Stripe")
	}
	return new Stripe(stripeSecretKey)
}
