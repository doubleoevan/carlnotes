## Why

Two sentences in the living specs do not say anything. `domain-schema` says a topic invite grants no
subscription "until acceptance or acceptance", and says a team invite grants membership "on acceptance
or acceptance". `invitations` says "The sender surfaces stage each entered username as a chip and
report a refusal by name when the invitations send", which has no working verb.

Both have been there since the teams change first wrote them. A reader cannot tell from either one what
the system does, and the domain-schema sentence hides a real distinction the same paragraph goes on to
draw: a Subscription row is created at "self-subscribe, invite acceptance, token acceptance, or team
join", so the two paths the broken clause collapsed are accepting an invite and accepting a token.

## What Changes

Nothing in the code. This corrects two sentences to describe the system as it already behaves.

- `domain-schema` names the two acceptance paths instead of repeating one of them twice.
- `invitations` gets a working sentence for what the invite form does, and says reject rather than
  refuse, matching the rename the rest of the invite vocabulary already took.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `domain-schema`: the invite paragraph SHALL name invite acceptance and token acceptance as the two
  ways a subscription or a membership begins.
- `invitations`: the username paragraph SHALL state what the invite form shows and what it reports.

## Impact

Specs only. No code, no migration, no test. `openspec validate` is the check that the deltas apply
cleanly, and a grep for the two broken phrases is the check that neither survives.
