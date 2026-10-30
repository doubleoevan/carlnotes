import { SITE_URL } from "@carlnotes/contracts/site"
import { TERMS_AGREEMENT_COPY } from "@carlnotes/core/lib/sessionCopy"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

/**
 * Says that continuing by any sign-in path accepts the Terms and the Privacy Policy, with both linked, as the web's
 * session pages do above their footer link.
 */
export function TermsAgreementText() {
	return (
		<View className="mt-4 flex-row flex-wrap items-center justify-center">
			<Text className="text-center text-xs text-muted-foreground">{TERMS_AGREEMENT_COPY.prompt}</Text>
			<AnchorLink href={`${SITE_URL}/terms`} accessibilityLabel={TERMS_AGREEMENT_COPY.termsLink}>
				<Text className="text-xs text-link">{TERMS_AGREEMENT_COPY.termsLink}</Text>
			</AnchorLink>
			<Text className="text-center text-xs text-muted-foreground">{TERMS_AGREEMENT_COPY.joiner}</Text>
			<AnchorLink href={`${SITE_URL}/privacy`} accessibilityLabel={TERMS_AGREEMENT_COPY.privacyLink}>
				<Text className="text-xs text-link">{TERMS_AGREEMENT_COPY.privacyLink}</Text>
			</AnchorLink>
			<Text className="text-center text-xs text-muted-foreground">{TERMS_AGREEMENT_COPY.ending}</Text>
		</View>
	)
}
