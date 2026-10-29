// the join page's notice: a request that failed to reach the api offers a retry, and never reads as a rejected invitation
import { expect, test } from "bun:test"
import { INVITE_REJECTIONS } from "@carlnotes/core/lib/inviteRejections"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { InviteNotice } from "./InvitePage"

// a failed request shows the retry, with none of the rejection copy that tells the user to discard the link
test("a failed acceptance request shows a retry, not an unknown invitation", async () => {
	const noticeHtml = await renderWithRouter(
		<InviteNotice isInviteAcceptFailed inviteRejection={null} onRetry={() => {}} />,
	)
	expect(noticeHtml).toContain("check your invitation.")
	expect(noticeHtml).toContain("try again")
	expect(noticeHtml).not.toContain("know that invitation")
	expect(noticeHtml).not.toContain("fresh link")
})

// a rejected token still shows its own rejection, and the loading line shows before either
test("a rejected token shows its rejection, and the loading line shows before it", async () => {
	const rejectionHtml = await renderWithRouter(
		<InviteNotice isInviteAcceptFailed={false} inviteRejection="unknown" onRetry={() => {}} />,
	)
	// the apostrophe in the rejection copy renders escaped
	expect(rejectionHtml).toContain(INVITE_REJECTIONS.unknown.replace("'", "&#x27;"))
	expect(rejectionHtml).toContain("fresh link")

	// nothing decided yet shows the loading line
	const loadingHtml = await renderWithRouter(
		<InviteNotice isInviteAcceptFailed={false} inviteRejection={null} onRetry={() => {}} />,
	)
	expect(loadingHtml).toContain("Carl is checking your invitation…")
})
