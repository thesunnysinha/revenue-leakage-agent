# Candidate AI Tool Usage Log

This log records the candidate's prompts to Codex while designing and implementing the challenge solution. Prompt text is copied from the conversation where available; follow-ups are grouped with the related task. Responses were reviewed and iterated on rather than accepted without checking.

## Architecture and human approval flow

**Tool used:** Codex (OpenAI)
**Context:** Choose an approach for a financial investigation agent and decide where human approval belongs.

**Prompts:**

```text
what approach should i take to solve this ?
should i add human in loop ?
```

```text
should we create a mcp and wit that a tool that will frame the question and sent it to user to include human in the loop and on response restuns to the loop.. should we use langgraph here ?
```

```text
then how we will build the agents ?
```

```text
we will need orchestrator and guarrails, retry mechanism in loop and all .. how can we achive that without anggraph
```

```text
why are we moving away from langgraph .. when there things are easily buildable suign langgraph ?
```

**Result:** Compared a custom orchestration loop with LangGraph and selected LangGraph for explicit graph state, retries/guardrails, and resumable human approval. The approval flow was designed to pause before sandbox writes and resume from the chat UI after a reviewer decision.

**Follow-up:**

```text
craete a proper plan for the agents and how things will orchestrate and how human in loop will work all through the chat ui.. sue latest docs using context7 if possible
```

**Reflection:** Iterative architecture questions helped expose requirements that a one-shot design could miss, especially that approval must be enforced in runtime control flow and remain resumable across chat requests.

## Reuse and project structure

**Tool used:** Codex (OpenAI)
**Context:** Adapt an existing codebase and preserve its established developer workflow.

**Prompts and instructions:**

```text
/Volumes/Annex/Projects/agent-runtime this is a codebase which was already i build.. if you need any reference from it you can take it
```

```text
structure docker env and all in same structure as repo i shared
```

```text
do whats faster.. reuse the code if faster
```

```text
and use same run.py setup as we where using int he same repo
```

**Result:** Reused the reference repository's service conventions and setup patterns, then organized the challenge with a root `run.py`, root Docker Compose file, root data directory, and separate service environment files.

**Follow-up:** The user selected OpenAI as the model provider and requested a frontend environment file and example file.

**Reflection:** Using an existing project as a reference reduced setup churn, but required checking domain-specific names, paths, and schemas rather than copying them unchanged.

## Agent framework and model choices

**Tool used:** Codex (OpenAI)
**Context:** Resolve implementation choices for the agent and chat application.

**Prompts:**

```text
i will be using openai
```

```text
should we use react instead of next js?
```

```text
implement the best .. isnt the zustand and vercel ai sdk the best ?
```

**Result:** Kept Next.js for the existing app structure, used the Vercel AI SDK chat transport with Zustand for session/approval state, and configured OpenAI for the backend model provider.

**Follow-up:** Checked the installed AI SDK and Next.js APIs during implementation because the project versions use newer interfaces than older examples.

**Reflection:** Library preference was treated as a constraint to evaluate against the actual project and installed versions, not as a substitute for verifying APIs and integration behavior.

## User-facing explanation and documentation

**Tool used:** Codex (OpenAI)
**Context:** Clarify the challenge objective and keep implementation decisions documented.

**Prompts:**

```text
what do this mean :- This challenge simulates an AI “financial detective” that investigates revenue leakage and can propose and apply fixes in a sandbox.
```

```text
craete a mermaid clock drigram how agents are designed and how human in loop are designed sepeartly
```

```text
craete the docs in the docs directory and maintian decision and lessons directory in the docs and maintian changelog.md
```

```text
maintain changelog at root of the project
```

**Result:** Explained revenue leakage in billing terms and added architecture diagrams, decision records, lessons, and a root changelog.

**Follow-up:** Requested corrections to naming and placement when generated documentation did not match the requested domain or repository layout.

**Reflection:** Documentation review caught mismatches that tests alone would not detect, including stale agent naming and misplaced changelog content.

## Implementation review and CI

**Tool used:** Codex (OpenAI)
**Context:** Build tests and repository checks, then respond to identified issues.

**Prompts and instructions:**

```text
and add proepr test in modular structure in the the agent
```

```text
add pipeline to chekc for changelog if not then fail and another which will check for the test acses and craete a private repo as described in the read me
```

**Result:** Added modular backend tests and a quality workflow that checks changelog updates, test discovery/execution, lint, frontend type checking, and production build.

**Follow-up:** CI was adjusted to align with the repository's actual layout and commands.

**Reflection:** Automated checks make expected maintenance work visible and repeatable; the local test suite and build were run before reporting success.

## Groundedness bug investigation

**Tool used:** Codex (OpenAI)
**Context:** Diagnose a failed investigation in the running chat application.

**Prompt:**

```text
getting this :- **You**
Can you check if there are any revenue leakage issues with plan C-1001
**Couldn’t complete that step.**{"error":"Response contained ungrounded numeric values not derived from tool results."}Dismiss
```

**Result:** The numeric groundedness check was comparing formatted response amounts such as `$8,000` with bare numeric evidence such as `8000`. It was updated to normalize those values while avoiding plan identifiers and date fragments, and a regression test was added.

**Follow-up:**

```text
i have authenticated try again
```

GitHub CLI initially reported an invalid token. After browser re-authentication, the private repository was created and the solution was pushed to `main`.

**Reflection:** The failure message directed the investigation toward the verifier. A targeted regression case was used to check both the accepted formatted amount and nearby false-positive cases.

## Responsive UI and repository submission

**Tool used:** Codex (OpenAI)
**Context:** Improve the chat response layout from a screenshot and prepare personal repository submission.

**Prompt:**

```text
can we improve the respons edeisng her e:-

and input field is going down

this is the assignment repo shared.. remove it and configure mine
```

**Result:** The conversation panel was made independently scrollable so the composer remains visible, and assistant messages now render common Markdown structure rather than showing raw Markdown markers.

**Follow-up:**

```text
craete a repo suing gh cli and push the code.. with candidate prompt populated
```

The prompt log was populated from this conversation. After browser re-authentication, a private repository was created and the solution was pushed to `main`.

**Reflection:** Screenshot-based feedback identified both a layout issue and a message-formatting issue. The UI changes passed lint, TypeScript, and production build checks; backend tests and Ruff also passed.

## Persistent chats and database-backed sessions

**Tool used:** Codex (OpenAI)
**Context:** Add multiple saved investigations and resume them later, including approval-waiting graph state.

**Prompt:**

```text
and integrate db for the chat and all so that we can permisst chat and craete new chats
```

**Result:** Planned PostgreSQL storage for chat sessions and transcript messages, plus a Postgres-backed LangGraph checkpointer so suspended approvals survive backend restarts. The API contract adds create/list/load chat endpoints, and the UI gains recent-chat navigation and new-chat creation.

**Follow-up:**

```text
are we not logging the tool calls and all
```

```text
do not push just add this
```

```text
add logging for all the tools trigerred
```

The implementation was kept local and not pushed. Tool invocation logging records tool names, IDs, argument field names, outcomes, and duration while excluding argument values and tool output.

**Reflection:** Conversation transcript persistence and graph checkpoint persistence are separate requirements: saving only the messages would not restore a paused approval. Both are being stored in PostgreSQL, and the chat UI reads its list and transcript through the backend API.
