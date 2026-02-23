# Development Environment

## Sandbox Constraints

The Claude process is sandboxed. Browsers (Chromium, Chrome, Firefox, etc.) cannot run in this sandbox. Do not run Playwright, Puppeteer, or anything that launches a browser. Running `node`, `npx`, and `npm run` directly is fine for tasks that don't depend on a browser (e.g. `npm run test` for unit tests).

## Dev Server

A separate terminal window runs the dev server in a restart loop:

```
while true; do npx next dev -p 3099 2>&1 | tee output.txt; echo "--- restarted ---"; sleep 1; done
```

### How to use it

1. **Code changes + restart**: Use `./debug.sh '{"action":"..."}'` to kill the server (triggering restart with code changes), wait, then curl the debug endpoint. Edit `src/app/api/debug/route.ts` to add new debug actions as needed.
2. **Server logs**: Read `output.txt` for all server output.
3. **Triggering non-debug endpoints**: Add a new action to debug route that calls the desired code path internally, then use `./debug.sh`. Do NOT use `kill` or `curl` directly — `debug.sh` handles the kill+wait+curl cycle and avoids per-command user approval.
4. **Never launch a browser directly** — scraping that requires a browser must go through the dev server via `./debug.sh`. Non-browser commands (`npm run test`, `node` scripts, etc.) can be run directly.

## Task Tracking

Each task is its own markdown file:

- **Open tasks**: `tasks/todo/` — one `.md` file per task.
- **Completed tasks**: `tasks/done/` — move the file from `todo/` to `done/` when finished, adding a completion date and summary of what was done.
