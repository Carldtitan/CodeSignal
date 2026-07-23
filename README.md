# CodeLab — CodeSignal Practice Workspace

A local, LeetCode-inspired practice interface for the 526 exercises in this repository. The original Python, SQL, JavaScript, and HTML solutions are converted into a searchable problem catalog at runtime, so the source collection remains the single source of truth.

## What is included

- Searchable problemset with category and difficulty filters
- Dark split-pane problem, editor, and testcase workspace
- Monaco code editor with autosaved progress per problem
- Local Python and JavaScript execution with a five-second timeout
- Curated submit/judge cases for selected popular exercises
- Custom JSON testcase inputs for every standard runnable `solution(...)`
- Submission history and solved/attempted progress stored in the browser
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

## Checks and production build

```bash
npm test
npm run build
npm start
```

The local runner executes editor code on your computer. Only run code you trust.

## Project structure

```text
CodeSignal/          Original challenge and reference-solution collection
server/              Catalog extraction, curated judge cases, and local runner
src/                 React practice interface
test/                Catalog and runner tests
server.mjs           Express/Vite development and production server
```

## Attribution

The exercise collection and imported reference solutions originated in [amshrestha2020/CodeSignal](https://github.com/amshrestha2020/CodeSignal). The practice workspace in this fork is an independent interface and is not affiliated with CodeSignal or LeetCode.
