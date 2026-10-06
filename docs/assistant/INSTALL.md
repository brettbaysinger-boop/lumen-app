# First assistant release: My Day

Branch: `feat/lumen-my-day`. Built on the gold take 2 redesign. This starts the ten
workstreams in ROADMAP.md; vision analysis, local file ingestion, recurring
reminders, external integrations, and proactive check-ins are not implemented.

## Included

- Persistent tasks, reminders, notes, checklists, projects, and goals.
- Explicit conversation actions with saved cards and reversible archive/restore.
- My Day completion, editing, rescheduling, checklist progress, and resume-in-chat.
- Search across active memories, conversation messages, and My Day titles/notes,
  with links back to source conversations. This is full-text keyword search;
  semantic retrieval and local file import come later.
- In-app due-reminder inbox, durable dismissal, and duplicate-delivery prevention.
  Optional browser notifications require permission and work while Lumen is open.
  Closed-browser/mobile push is not included. Due reminders appear on return.
- Account and companion isolation enforced by database RLS and authenticated API.

## Conversation examples

```text
Add a task: call the mechanic
Remind me tomorrow at 9 am to call the mechanic
Remind me in 30 minutes to stretch
Create a shopping list: milk, eggs, coffee
Save a note: opening paragraph for my proposal
Start a project: organize the garage
Set a goal: practice Spanish three times a week
What's on my plate?
Search my history: Sarah movie
```

Explicit supported commands save without an additional approval step. Casual
remarks remain conversation. Ambiguous reminder times ask for a complete time;
repeat the full instruction with AM/PM. Dates use the browser/device timezone.
Search retrieves sources rather than inventing a remembered fact.

## Import onto your existing checkout

The bundle contains take 1, take 2, and this assistant increment. Preserve any
additional local work by cherry-picking onto a branch from your local checkout:

```bash
cd ~/lumen-push
git status --short
# Start after committing or stashing any local changes.
git switch -c feat/lumen-my-day-local
git fetch ~/Downloads/lumen-my-day.bundle feat/lumen-my-day
```

If take 2 is installed, cherry-pick only the latest commit:

```bash
git cherry-pick FETCH_HEAD
```

If neither redesign is installed, cherry-pick all three in order:

```bash
git cherry-pick cc7ca99 722cc8d FETCH_HEAD
```

If only take 1 is installed, use `git cherry-pick 722cc8d FETCH_HEAD`.
The bundle requires integration ancestor `6ccfcbc`, available by fetching
GitHub's `feat/lumen-integration` branch if it isn't in your local history.
Resolve any conflicts against your newer local changes before proceeding.

Then apply migrations and rebuild using the existing local configuration:

```bash
"$HOME/.local/share/lumen-tools/node_modules/.bin/supabase" migration up --local
npm ci
npm run typecheck
npm run build:web
sudo systemctl restart lumen-api.service lumen-web.service
```

The build uses your existing `.env`; review exports here used placeholder local
addresses and are not included in the bundle. No new backend dependencies are
required. The API must be restarted for its new routes. Existing startup services
and database data are preserved. Nothing is deployed by downloading the bundle.

## Acceptance checks on your machines

1. Add a reminder in chat with an explicit AM/PM time. Confirm its card and My Day.
2. Complete/reopen a task, check a list item, and reload to verify persistence.
3. With Lumen open, create a reminder due in a minute. Check the in-app inbox,
   optionally allow browser alerts, then dismiss it and reload.
4. Close the app until a reminder is overdue; reopen and verify it appears.
5. Search for a phrase from an old conversation and open its source.
6. Select Work on it together; verify the saved context is drafted in chat and
   isn't automatically sent. Then continue the activity.

## Boundaries

The first My Day list shows up to 500 most recent records; search returns up to
30 matching sources, and chat agendas show up to 50 open items. Recurrence,
background push, real calendar appointments, semantic recall, local document
search, and vision are later releases. Camera photos currently remain
attachments; the model does not yet interpret their pixels.
