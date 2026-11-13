## 1. Release on push

- [x] 1.1 Restore the `vcs-push` trigger on `main` in `infra/northflank/release-main.json`, drop the `sha` argument,
  and apply it with `northflank create workflow`
- [x] 1.2 Remove the `release` job from `.github/workflows/ci.yml`
- [x] 1.3 Describe the push trigger in `apps/docs/deployment.md`
