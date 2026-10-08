# Everyday capture

Workstream #4 now supports explicit chat commands for persistent named lists,
gift ideas and quick notes. All captures belong to the current companion and
signed-in owner. They appear in My Day, where the existing editor supports
changing text, checking items off, completing and archiving.

| Chat command | Result |
| --- | --- |
| `add milk, eggs to my shopping list` | Creates or appends to the open Shopping list |
| `put sunscreen on my packing list` | Creates or appends to the open Packing list |
| `show my shopping list` | Reads the current open list with completion marks |
| `save a gift idea: a book for Sarah` | Appends one entry to Gift ideas list |
| `take a note: ask about the warranty` | Saves a note containing the supplied words |
| `remember this: ask the doctor about sleep` | Saves a My Day note, separate from long-term memory |
| `save a note: project measurements` | Existing note command remains supported |

Comma-separated list entries are split into individual checklist items. Gift
ideas remain one entry even when they contain commas. Commands preserve the
user's wording; no model call or additional confirmation is needed for these
explicit saves. Standalone commands may include surrounding straight or smart quotes, a
punctuated greeting, or the selected companion’s name. Gift ideas and quick notes
accept a colon, period, comma or space before the content. Casual statements,
commands embedded in reported speech and negative requests do not trigger captures. This first increment supports the command forms
above, rather than arbitrary conversational references such as “save that”.

List appends use an owner-scoped, invoker-rights transaction: lock, resolve the
open list, append, then record the request key. The same request key is a retry
and does not append twice. Sending the same words as a new message is a new
capture, allowing intentional duplicate entries. Multiple open lists with the
same name require renaming in My Day; no arbitrary selection is made. Completed
or archived lists are not reopened by a new append. Lists allow 100 entries of
up to 300 characters each. Quick notes allow 12,000 characters.

Chat cards show the saved body/checklist snapshot and link to My Day for current
content and editing. Archive list affects the entire list, not only the newest
entry. Historical snapshots remain in their conversations even if the list is
later changed or archived. Read-list requests inspect up to 500 recent open
lists. Editing a whole checklist in My Day still replaces that checklist; avoid
simultaneous edits to the same list from several devices.

## Deployment and validation

Apply `20261008130000_everyday_capture.sql` before restarting the API, then
clean-export the web application using the HTTPS public service URLs. No new
Python or JavaScript runtime dependencies are needed.

Local verification: 198 backend tests, TypeScript validation, clean web export,
and `node scripts/test-capture-sql.cjs`. Database tests cover persisted appends,
retry receipts, invalid-input rollback, ambiguous names, completed-list isolation,
cross-companion rejection and owner/anonymous access. After deploying `6e1260e`, the user reported the corrected capture flow working
on October 8. This is user-reported deployment verification. Browser visual
behavior has not been separately checked by automation for this increment.

On mobile: add milk, then eggs; show the list; open My Day and check off milk;
reload; add a gift idea and a quick note; verify both persist after reloading.

## Reported input regression fix

The first host test found that greeting-prefixed milk capture, a period-separated
gift idea and a smart-quoted note bypassed the parser. The eggs command and list
read did work. Regression checks now cover the three exact input forms and their
persisted receipts. Generated “added” and “taken a note” claims are checked, and
repeated unsupported save claims produce a no-save response rather than dumping
unrelated memories. Missing gift/note content asks for clarification. The fix
requires no migration. On October 8, the user reported that the fix worked.
