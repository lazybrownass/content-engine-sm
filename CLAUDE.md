# Claude Code Operating Guidelines — Content Engine SM

## Rules & Quality Controls
1. **Step-by-Step Execution**: Never write entire multi-file features at once. Build sequentially: Schema -> Backend API -> Frontend Component -> Integration Test.
2. **Mandatory Review Gate**: After generating or altering code, always run `npm run typecheck` and `npm run test:unit`. Fix all errors before proceeding.
3. **Commit Standards**: Enforce Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`). No AI attribution in commit messages.
4. **Environment Awareness**:
   - Local DB runs via Docker on `127.0.0.1:54322`
   - Kong Gateway runs on `54321`
   - Local App server runs on `http://localhost:3000`

## Ponytail Discipline (Anti-Overengineering)
- **The Decision Ladder**: Before writing code, check:
  1. Does this feature need to exist at all? (YAGNI)
  2. Is it already in the codebase?
  3. Does the Node.js / Next.js stdlib solve it natively?
  4. Does an existing dependency solve it?
  5. Can it be written in fewer lines without custom abstractions?
- **Zero Unrequested Abstractions**: No single-use interfaces, no wrapper factories, no unused config files.
- **Deletion > Addition**: Prefer cutting code over writing new code.
