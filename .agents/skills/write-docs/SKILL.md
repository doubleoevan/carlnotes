---
name: write-docs
description: >
  Clear, persuasive writing rules for docs, in the style of Amazon's writing
  culture. Use when writing or editing ANY prose meant for a human reader:
  READMEs, design docs, proposals, 1-pagers, RFCs, ADRs, PR descriptions,
  runbooks, release notes, and status updates. Covers leading with the
  so-what, short subject-verb-object sentences, data over adjectives, cutting
  weasel words and hedges, plain language and defined terms, narrative
  formats, appendices, and naming owners. Code comments follow code-style.
  Commit messages follow git-discipline.
metadata:
  source: https://medium.com/@apappascs/write-like-an-amazonian-14-tips-for-clear-and-persuasive-communication-e2a11afc7362
  source-author: Alexandros Pappas
---

# Write Docs

A doc is read by someone busy who did not write it and cannot ask what you
meant. Every sentence moves that reader toward understanding or a decision.
Cut any sentence that doesn't.

### 1. Lead with the so-what

The first paragraph says why the doc exists and what the reader should do.
Run the so-what test before sending: if the reader stops after the first
paragraph, do they know the point and the ask? If not, rewrite the opening.

    wrong — the point arrives in paragraph four
    Over the last quarter the team has been looking at how search behaves
    under load, and we noticed a few patterns worth discussing...

    right — the purpose and the ask, up front
    Search times out for 4% of queries at peak. This doc proposes moving the
    index to a dedicated cluster and asks for approval by Friday.

### 2. Write for the reader in front of you

Decide who reads the doc and what they already know before writing the first
line. A README for a new contributor explains setup. A design doc for the team
skips setup and spends its words on the tradeoff. Match the depth and the
vocabulary to that reader, not to yourself.

### 3. Short sentences, one idea each

Keep every sentence under 30 words and give it one idea. When a sentence needs
"and", "which", or a semicolon to hold together, split it.

    wrong — three ideas chained into one sentence
    The worker retries failed jobs, which can cause duplicate emails if the
    provider accepted the first attempt, so we added an idempotency key that
    the provider checks before sending.

    right
    The worker retries failed jobs. A retry can send a duplicate email when
    the provider already accepted the first attempt. An idempotency key on
    each send prevents the duplicate.

### 4. Subject, verb, object

Name who does what. Put the actor first and use an active verb. Passive voice
hides the actor, and the reader has to guess who is responsible.

    wrong
    The migration will be run after the config has been updated.

    right
    The deploy script runs the migration after it updates the config.

### 5. Data over adjectives

An adjective is a claim without evidence. Replace it with the number that
earns it, or cut it.

    wrong
    The new cache dramatically improves performance.

    right
    The new cache cuts p95 page load from 1.8s to 0.6s.

When there is no number yet, say so and say how it will be measured. Never
fill the gap with "fast", "robust", "seamless", or "significant".

### 6. No weasel words

Weasel words sound like a claim but commit to nothing: "may", "might",
"could", "should help", "many", "often", "some users", "nearly all". State
what is known and where it came from, or state what is unknown.

    wrong
    This change might reduce errors for many users.

    right
    In the canary, this change cut checkout errors from 212 to 9 per day.

    right — when it is not known yet
    We have not measured the error rate yet. The canary runs Tuesday.

### 7. No adverbs or hedges

"Very", "really", "extremely", "basically", "simply", "I think", "it seems",
and "arguably" weaken the sentence they sit in. Cut them. A claim that needs a
hedge needs data instead (rule 5).

    wrong
    I think this approach is really much simpler to maintain.

    right
    This approach removes the sync job and its 400 lines.

### 8. Concrete over abstract

Show what the thing does instead of labeling it. "Innovative", "powerful",
and "flexible" ask the reader to trust you. A description of the behavior lets
them see it.

    wrong
    The new CLI offers a powerful, flexible workflow.

    right
    The new CLI deploys a branch with one command and rolls it back with
    another.

### 9. Plain words, defined terms

Use the simple word over the complex one: "use" over "utilize", "start" over
"initiate", "help" over "facilitate". Cut jargon a newcomer would not know.

Spell out an acronym on first use, then use the short form. Define a technical
term the first time it appears, in one sentence.

    wrong
    Requests go through the BFF, which enforces the SLO.

    right
    Requests go through the backend-for-frontend (BFF), a small server that
    shapes data for the web app. It enforces the service level objective
    (SLO): 99.9% of requests answer in under 300ms.

### 10. Pick the format for the job

A doc that argues for a decision is written as prose: a 1-pager for a small
decision, up to a 6-pager for a large one. Full sentences force the reasoning
to connect. Bullets and slides let gaps hide between the lines.

A reference doc, such as a README or a runbook, uses headings, numbered steps,
and lists, because the reader scans it for one answer instead of reading it
top to bottom.

### 11. Appendices hold the detail

The body includes the argument. Supporting material goes in an appendix at the
end: benchmark tables, full schemas, charts, alternatives considered in depth,
long logs. Point to it from the body in one line. A reader who trusts the
summary never has to open it.

### 12. Name the owners

When a doc proposes work, say who does what. When more than two people or
teams are involved, add a RACI table: who is Responsible for the work, who is
Accountable for the outcome, who is Consulted before, and who is Informed
after.

    | Task                  | Responsible  | Accountable | Consulted     | Informed |
    | --------------------- | ------------ | ----------- | ------------- | -------- |
    | Move the search index | Backend team | Eng lead    | Platform team | Support  |

### Self-check

Reread the doc once as its reader before handing it off.

- The first paragraph states the point and the ask.
- No sentence runs past 30 words.
- Every adjective that makes a claim has a number behind it, or is cut.
- No "may", "might", "could", "very", "really", or "I think".
- Every acronym and technical term is defined on first use.
