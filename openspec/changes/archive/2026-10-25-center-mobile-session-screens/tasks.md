## 1. Center the session screens

- [x] 1.1 Add `apps/mobile/src/components/common/ClassNameSafeAreaView.tsx`, the safe area view through `withUniwind`,
  and use it in `SessionScreen.tsx` and `app/index.tsx`
- [x] 1.2 Give the session screen's scroll content the web's column: `w-full max-w-sm grow justify-center gap-4
  self-center px-4 py-12`
- [x] 1.3 Update `apps/mobile/AGENTS.md` with the column and `ClassNameSafeAreaView.tsx`

## 2. Verify

- [x] 2.1 Compare the sign-in screen with the web's login page on the iPhone and the iPad simulators, and the email
  form, which is taller
- [x] 2.2 Check the logo on one line at the largest accessibility text size on the iPhone
- [x] 2.3 `bash scripts/preflight.sh` is green
