## Decisions

The feedback transaction verifies the caller’s role and locks the Topic before writing. It upserts one vote and optional note per user and topic memory. A thumbs-down with a note supplies a correction. A thumbs-down without a note retires the claim.

The Journal paginates the visible active groups. The prompt reader ranks eligible groups by feedback priority, relevance where available, importance and recency. It selects up to 20 groups. The formatter fits complete claims and notes within 1,800 bytes.

## Verification

Use an isolated Postgres database to save 31 distinct votes with notes. Reopen all Journal pages and compare the persisted rows with the runtime prompt selection.
