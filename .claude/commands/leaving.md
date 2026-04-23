---
# /leaving — Close Session Skill

You are closing this working session. Before the user leaves, capture everything needed to continue seamlessly in the next session.

---

## Phase 1 — Review the Conversation

Look back at what was worked on in this session. For each piece of work, identify:
- What project or file it belongs to
- What was done
- What insight or decision was reached
- What still needs to happen next
- Where exactly to pick up (file path and section if relevant)

---

## Phase 2 — Update open-threads.md

Read `/Users/cucumba/flexatraining/open-threads.md` first.

Then update it:
- If a thread was worked on, update its status, "What was done," and "What to do next"
- If a thread was completed, remove it
- If new work was started that has no thread yet, add a new thread entry using the same format as existing entries
- Update the "Last updated" date on any thread you touch

Keep entries plain and specific. The next Claude reading this should be able to pick up without needing to ask what happened.

---

## Phase 3 — Run /save

Run the `/save` skill to commit and push everything to the remote.

---

## Phase 4 — Confirm and Exit

Tell the user in one or two sentences what threads were updated and that the project is saved. Keep it short.

Then run `/exit` to close the session.
