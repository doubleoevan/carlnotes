## 1. Harness

- [x] 1.1 Record the commit, whether the tree had changes, and the writer's and the grader's ids in each saved result
- [x] 1.2 Print each eval's pass rate with a 95% Wilson interval, and whether it clears the eval's gate
- [x] 1.3 Skip the saved result in CI, and write the report's table to the job summary there
- [x] 1.4 Name a gate in every eval, and exit with a failure below it
- [x] 1.5 Turn the prompt registry off as an eval imports the harness, and share the chat link check and the prose
  paragraph split from it
- [x] 1.6 Test the gate, the rubric assertions, the link check, and the paragraph split

## 2. CI

- [x] 2.1 Add `.github/workflows/evals.yml`: report-only, on a push to `main` that touches a prompt, the code that builds
  one, the model config, or an eval, weekly, and by hand, one eval at a time, with the full results as an artifact

## 3. New evals

- [x] 3.1 Move each eval's rubrics, material label, and grader model into a `<name>Rubrics.ts`, and add the grader
  calibration eval over every shared rubric
- [x] 3.2 Export `generateSearchQueries` and `MAX_SEARCH_QUERIES`, and add the search queries eval
- [x] 3.3 Add the attachment summaries eval, with images drawn when it runs
- [x] 3.4 Add the team chat eval
- [x] 3.5 Export `toDocsBlock` from the chat retrieval, and add a docs question to the topic chat eval

## 4. New cases and corpora

- [x] 4.1 Add removing a source, rewriting the prompt, and a decline to the topic chat tools eval
- [x] 4.2 Add the visibility choice to the new-topic chat eval
- [x] 4.3 Check the outline prompt's segment rule and the transition into each later segment in the podcast eval
- [x] 4.4 Grow the scanner corpus, add written `watch` and `listen` rows to each review pipeline fixture, and keep them
  on a second export

## 5. Docs and runs

- [x] 5.1 Update the README, `evals/README.md`, and `AGENTS.md` for CI, the new evals, and the gates
- [x] 5.2 Run every eval at `--repeat 3` and the review pipeline eval, and commit the results
- [x] 5.3 Share the eval label helpers in `evals/evalLabels.ts`, the docs site's address in `shared/seo.ts`, and the topic
  chat eval's burr set finding with the grader calibration
- [x] 5.4 Split the reply helpers out of the harness into `evals/evalReplies.ts`, and count a reply's bare urls and
  autolinks as links
