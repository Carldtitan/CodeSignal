# CodeLab — CodeSignal Practice Workspace

A local, LeetCode-inspired practice interface for the 526 exercises in this repository. The original Python, SQL, JavaScript, and HTML solutions are converted into a searchable problem catalog at runtime, so the source collection remains the single source of truth.

## What is included

- Searchable problemset with category and difficulty filters
- Dark split-pane problem, editor, and testcase workspace
- Monaco code editor with backend autosave status and persistent preferences
- Local Python and JavaScript execution with a five-second timeout
- Curated submit/judge cases for selected popular exercises
- Multiple custom JSON testcases for every standard runnable `solution(...)`
- Persistent notes, run results, timers, pane layouts, session state, and submission history
- Opt-in reference solution reveal
- Responsive layout for smaller screens

SQL and HTML exercises can be read and edited, but they are not executable because the original repository does not include their database or browser fixtures.

## Run locally

Requirements: Node.js 20+ and Python 3 available as `python`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The backend creates `data/codelab-state.json` automatically. This private, Git-ignored file is the source of truth for everything you do in the workspace. Reopening the app restores the active problem and the exact state of your practice session. Existing progress from the previous browser-storage version is imported automatically on first launch.

## Checks and production build

```bash
npm test
npm run build
npm start
```

The server checks `python`, `python3`, and the Windows `py -3` launcher at startup, and always exposes its Node.js runtime for JavaScript. If Python lives elsewhere, set `CODELAB_PYTHON` to the executable path before starting the app. The local runner executes editor code on your computer, so only run code you trust.

## Project structure

```text
CodeSignal/          Original challenge and reference-solution collection
server/              Catalog extraction, curated judge cases, and local runner
src/                 React practice interface
test/                Catalog and runner tests
data/                Private local session state (created on first launch)
server.mjs           Express/Vite development and production server
```

## Attribution

The exercise collection and imported reference solutions originated in [amshrestha2020/CodeSignal](https://github.com/amshrestha2020/CodeSignal). The practice workspace in this fork is an independent interface and is not affiliated with CodeSignal or LeetCode.
