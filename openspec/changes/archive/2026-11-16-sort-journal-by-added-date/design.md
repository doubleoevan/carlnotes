## Context

The shared reader grouped active, authorized rows before paginating. Feedback priority then placed saved claims ahead of new claims. Each stored row already has a creation timestamp.

## Goals / Non-Goals

- Display the most recently added claims on the first Journal page.
- Keep repeated claims grouped and retain the same response fields.
- Preserve the criteria Carl uses to select claims for prompts.

## Decisions

Read rows in creation order, with the row ID as the tie-breaker. This lets the existing grouping function place each group at its earliest eligible row. Reverse the groups before paginating. Keep the existing rule that selects the best wording within a group.

## Risks / Trade-offs

A saved claim can move to a later page as new claims arrive. A repeated observation keeps the original group's place while updating the displayed wording. An older brew backfilled today appears as a new addition.
