# Architecture Diagrams

## Agent Graph Design

How the `FinancialDetective` LangGraph nodes connect and route:

```mermaid
flowchart TD
    A([User Query]) --> B[FastAPI /chat]
    B --> G1[SecurityGuardrail]
    G1 --> G2[PIIGuardrail]
    G2 --> LLM[agent node\nGPT-4o reasoning]

    LLM -->|has tool_calls — read tools| TOOLS[ToolNode\nload_plan · query_invoices\nfx_convert · propose_*]
    LLM -->|no tool calls| VERIFY[verify node\nGroundedness check]
    LLM -->|loop_detected| FALLBACK[fallback node\nSafe error response]
    LLM -->|write tool detected| GATE[approval_gate node\ninterrupt — hard pause]

    TOOLS --> LLM

    VERIFY -->|clean| END1([Response to user])
    VERIFY -->|hallucination detected| LLM

    GATE -->|waiting| END2([HTTP 200\nrequires_human_approval=true])

    subgraph Guardrails applied inside agent node
        AG[ApprovalPolicyGuardrail\nblocks apply · rollback]
        LG[LoopGuardrail\nmax 10 steps · detects repeated calls]
        GG[GroundednessGuardrail\nrejects hallucinated figures]
    end
```

## Human-in-the-Loop Flow

How the approval interrupt works end-to-end between browser and LangGraph:

```mermaid
sequenceDiagram
    participant U as User / Browser
    participant FE as Next.js Frontend
    participant NH as /api/chat Route Handler
    participant API as FastAPI
    participant AG as FinancialDetective
    participant CP as InMemorySaver\n(checkpointer)

    U->>FE: "Apply credit memo for ACME"
    FE->>NH: POST /api/chat {query, sessionId}
    NH->>API: POST /api/v1/agent/chat
    API->>AG: execute(query, session_id)
    AG->>AG: agent node → ApprovalPolicyGuardrail\ndetects apply tool call → requires_approval=true
    AG->>CP: save graph state @ thread_id=session_id
    AG-->>API: interrupt() — graph hard-paused
    API-->>NH: {requires_human_approval: true, pending_approval_details}
    NH-->>FE: UIMessageStream finish chunk\n(messageMetadata with approval details)
    FE-->>U: Shows ApprovalCard\n⬜ Approve  ⬜ Reject
    Note over FE: Input disabled — waiting for decision

    U->>FE: Clicks ✅ Approve
    FE->>FE: fetch /api/approval {session_id, approved: true}
    FE->>API: POST /api/v1/agent/approval
    API->>CP: load state @ thread_id=session_id
    CP-->>AG: resume with Command(resume={approved: true})
    AG->>AG: approval_gate → goto tools\napply tool executes → writes to data/sandbox/
    AG-->>API: AgentResult with confirmation message
    API-->>FE: ChatResponse {response: "Credit memo applied…"}
    FE->>FE: setMessages([...prev, assistantMessage])
    FE-->>U: Confirmation shown in chat
```

## Data Flow

How data moves from source JSON through the agent to the sandbox:

```mermaid
flowchart LR
    subgraph data/ at repo root
        BP[billing_plans.json]
        INV[invoices.json]
        CM[credit_memos.json]
        FX[exchange_rates.json]
        SB[sandbox/*.json\nwritable ledgers]
    end

    subgraph BillingRepository
        R[read methods\nparse_float=Decimal]
        W[write methods\nJSON dumps]
    end

    subgraph FinancialDetective Tools
        T1[load_plan]
        T2[query_invoices]
        T3[fx_convert]
        T4[propose_*]
        T5[apply]
        T6[rollback]
    end

    BP & INV & CM & FX --> R --> T1 & T2 & T3
    T4 --> T5 --> W --> SB
    T6 --> W
```
