## Context

A transaction locks the episode owner, checks for an existing picture, counts monthly reservations and inserts a new one.

## Goals / Non-Goals

An admin can test more films in one month. Free accounts retain one platform-funded picture. Each new film still allows one Omni generation.

## Decisions

Read the role from the locked owner row. Use the existing admin-role helper, then enforce the plan count for ordinary owners. Charge extra admin shots to the owner’s model key so the existing spend backstop and explicit budget overrides apply.

Count only reservations marked as using the plan allowance. The owner, month and allowance index bounds the count to the plan’s included pictures. If an included reservation fails before submission, its slot becomes available even when another film has already reserved an extra shot.

## Risks / Trade-offs

More distinct admin pictures can increase spend. Retaining reservations preserves same-picture reuse and retry accounting.
