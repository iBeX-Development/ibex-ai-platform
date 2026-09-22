# iBeX Hybrid Intelligent AI Platform — Agent Architecture v1.0

**Version:** 1.0  
**Status:** Approved / Architecture Baseline

Энэ хувилбарыг **Master AI Policy v1.0-ийн доорх Agent Architecture-ийн үндсэн батлагдах baseline** болгон ашиглахад тохиромжтой.

### 1. Үндсэн архитектур

```text
┌──────────────────────────────────────────────┐
│                  Core iBeX                   │
│ System of Record / Workflow / Authorization │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│                  AI Gateway                  │
│ Auth / Tenant / Permission / Audit / Limits │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│       iBeX Hybrid Intelligent AI Platform                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                AI Orchestrator                     │  │
│  │ Intent → Domain → Agent → Tool/RAG → Response     │  │
│  └───────────────┬────────────────────────────────────┘  │
│                  │                                       │
│       ┌──────────┼───────────────────────────────┐       │
│       ▼          ▼          ▼           ▼        ▼       │
│   General   Maintenance   Asset     Warehouse   ...      │
│    Agent       Agent      Agent       Agent               │
│                                                          │
│          Shared Platform Services                        │
│  RAG │ Tools │ Model Gateway │ Memory │ Audit │ Eval     │
└──────────────────────────────────────────────────────────┘
```

**Батлагдсан зарчим:** Maintenance AI, Warehouse AI, Asset AI гэх мэт тусдаа бүтээгдэхүүн, тусдаа AI system үүсгэхгүй. Эдгээр нь **нэг iBeX AI Platform доторх specialized domain agent-ууд** байна.

---

# 2. Agent hierarchy

Agent architecture-ийг 3 үндсэн түвшинд зохион байгуулна.

### Level 1 — Master AI Policy

Бүх agent-д заавал үйлчлэх, agent өөрөө өөрчилж чадахгүй дээд түвшний policy.

Үүнд:

- tenant isolation
- identity / authorization
- permission enforcement
- confidentiality
- source trust
- RAG security
- tool execution rules
- read/write separation
- human approval
- hallucination handling
- audit requirements
- prompt injection defense
- data ownership
- model/provider governance

орно.

**Domain Agent-ийн prompt Master Policy-г override хийж болохгүй.**

---

### Level 2 — AI Orchestrator

Orchestrator нь хэрэглэгчийн хүсэлтийг өөрөө бүхэлд нь шийдэхээс илүүтэй **зөв capability руу route хийх** үүрэгтэй.

Үндсэн ажиллагаа:

```text
User Request
     ↓
Trusted Context Validation
     ↓
Intent Classification
     ↓
Domain Detection
     ↓
Permission Check
     ↓
Agent Selection
     ↓
RAG / Tool Selection
     ↓
Model Selection
     ↓
Agent Execution
     ↓
Policy / Output Validation
     ↓
Response
```

Orchestrator дараах зүйлсийг тодорхойлно:

- request-ийн intent
- domain
- шаардлагатай agent
- шаардлагатай RAG collection
- шаардлагатай live tool/API
- model complexity level
- approval шаардлагатай эсэх
- multi-agent coordination шаардлагатай эсэх

---

# 3. Domain Agent architecture

Эхний архитектурт дараах agent-ууд байна.

| Agent | Үндсэн domain |
|---|---|
| **General iBeX Agent** | Ерөнхий iBeX асуулт, navigation, system knowledge |
| **Maintenance Agent** | WO, maintenance planning, failure, maintenance history |
| **Asset Agent** | Asset hierarchy, asset history, condition, technical information |
| **PM Agent** | Preventive maintenance |
| **PdM Agent** | Predictive / condition-based maintenance |
| **Inspection Agent** | Inspection, findings, checklist, follow-up |
| **Warehouse Agent** | Inventory, warehouse, parts, stock |
| **HSE Agent** | Safety/HSE information and execution support |
| **Budget Agent** | Maintenance/project budget analysis |
| **Project/Contract Agent** | Project, contract, fulfillment analysis |

Энэ жагсаалт архитектурын хувьд **extensible** байна.

Шинэ domain нэмэхэд Orchestrator болон shared platform-ийг дахин архитектурчлах шаардлагагүй.

---

# 4. Agent-ийн дотоод стандарт бүтэц

Agent бүр ижил үндсэн contract-тай байна.

```text
Domain Agent
│
├── Agent Definition
├── Domain Prompt
├── Capability Manifest
├── Tool Allowlist
├── RAG Scope
├── Permission Requirements
├── Output Schema
├── Evaluation Rules
└── Version Metadata
```

Жишээ:

```text
Maintenance Agent
│
├── Prompt
├── Maintenance domain rules
├── Asset read tool
├── WO read tool
├── Maintenance history tool
├── WO recommendation capability
├── Maintenance RAG scope
├── Permission policy
└── Evaluation suite
```

---

# 5. Agent Capability Manifest

Agent бүр capability manifest-тай байна.

Жишээ концепц:

```yaml
agent:
  id: maintenance-agent
  version: 1.0

domain:
  - maintenance
  - work-order
  - failure-analysis

rag:
  - maintenance-handbook
  - approved-maintenance-procedures

tools:
  read:
    - asset.get
    - workorder.get
    - maintenance.history

  action:
    - workorder.create_request

permissions:
  - maintenance.read

approval:
  workorder.create_request: required
```

Энэ нь **implementation contract-ийн концепц** бөгөөд одоогоор production code биш.

---

# 6. Trusted Agent Context

Agent руу хэрэглэгчийн tenant эсвэл identity-г prompt text хэлбэрээр итгэж дамжуулахгүй.

AI Gateway-аас server-side trusted context ирнэ:

```text
tenant_id
user_id
role
permissions
entitlements
session_id
request_id
```

Дараа нь context immutable байдлаар execution-д дамжина.

```text
AI Gateway
    ↓
Trusted Context
    ↓
Orchestrator
    ↓
Domain Agent
    ↓
RAG / Tool
```

Agent:

- tenant сонгохгүй
- tenant өөрчлөхгүй
- tenant таахгүй
- өөр tenant-ийн data request хийхгүй.

---

# 7. RAG architecture

Agent болгон бүх document-д хандахгүй.

```text
                    RAG Layer
                       │
         ┌─────────────┼───────────────┐
         ▼             ▼               ▼
     General KB    Maintenance KB   Warehouse KB
```

Retrieval filter:

```text
tenant_id
document_scope
agent_scope
permission
document_status
version
```

RAG-д үндсэндээ:

- iBeX Handbook
- approved procedures
- manuals
- technical documentation
- standards
- approved tenant knowledge

байрлана.

### Гол дүрэм

**Document knowledge → RAG**

**Operational/live data → Tool/API**

WO, stock, asset state зэрэг transactional data-г бүхэлд нь vector database руу хуулж Agent knowledge болгохгүй.

---

# 8. Tool architecture

Agent Core iBeX database руу шууд хандахгүй.

```text
Agent
  ↓
Tool Runtime
  ↓
AI Gateway / Approved Service API
  ↓
Core iBeX
```

Tool бүр дараах metadata-тай:

```text
tool_id
version
domain
input_schema
output_schema
tenant_scope
required_permissions
read/write classification
approval_requirement
audit_requirement
timeout
```

Tools хоёр үндсэн ангилалтай.

### Read Tool

Жишээ:

```text
asset.get
asset.history
workorder.list
workorder.get
inventory.stock
inspection.result
```

### Action Tool

Жишээ:

```text
workorder.create_request
inspection.create_followup
inventory.prepare_issue
```

Action tool нь Core workflow-г bypass хийхгүй.

---

# 9. Human-in-the-loop

Agent санал гаргаж болно:

> Bearing vibration trend abnormal байна. Inspection хийхийг санал болгож байна.

Гэхдээ:

```text
AI recommendation
      ↓
User review
      ↓
Permission check
      ↓
Core approval/workflow
      ↓
Operational action
```

гэсэн зарчим мөрдөнө.

AI recommendation нь **approved engineering decision биш.**

---

# 10. Multi-agent interaction

v1.0-д бүх agent хоорондоо шууд чөлөөтэй харилцахгүй.

Зөв бүтэц:

```text
Agent A
   ↓
Orchestrator
   ↓
Agent B
```

Жишээ:

```text
User:
"Энэ насос байнга эвдэрч байгаа шалтгаан болон
сэлбэг байгаа эсэхийг шалга."

                ↓

          Orchestrator
          /           \
         /             \
Maintenance Agent   Warehouse Agent
       ↓                   ↓
Maintenance tools     Inventory tools
         \             /
          \           /
           Orchestrator
                ↓
          Final Response
```

Ингэснээр agent-to-agent uncontrolled data transfer үүсэхгүй.

---

# 11. Agent-to-Agent contract

Agent өөр agent-ийн internal prompt, memory эсвэл execution state руу шууд хандахгүй.

Зөвхөн structured result дамжуулна.

Жишээ:

```json
{
  "agent": "maintenance",
  "status": "completed",
  "facts": [],
  "recommendations": [],
  "sources": [],
  "confidence": 0.86
}
```

Ингэснээр:

- audit
- security
- orchestration
- debugging
- evaluation

илүү хяналттай болно.

---

# 12. Model Gateway

Agent өөрөө OpenAI эсвэл өөр provider-ийг шууд сонгохгүй.

```text
Domain Agent
      ↓
Model Gateway
      ↓
┌────────────┬────────────┬──────────────┐
│ OpenAI     │ Open-source│ Future model │
└────────────┴────────────┴──────────────┘
```

Model routing criteria:

- task complexity
- latency
- cost
- confidentiality
- context size
- reasoning requirement
- structured-output capability
- tool capability

Agent architecture model-independent байна.

---

# 13. Memory architecture

Memory-г agent бүр өөрийн unrestricted persistent memory хэлбэрээр ашиглахгүй.

Memory scope:

```text
Session Context
       +
Tenant-aware Conversation Context
       +
Approved Persistent Context
```

Бүх memory:

```text
tenant_id
user_id / permitted scope
session_id
source
retention
```

metadata-тай байна.

Нэг tenant-ийн memory өөр tenant-ийн context-д орохыг хориглоно.

---

# 14. Audit architecture

Agent execution бүр trace үүсгэнэ.

```text
request_id
tenant_id
user_id
session_id
agent_id
agent_version
prompt_version
model
model_version
RAG sources
tool calls
tool results metadata
response
token usage
cost
latency
approval state
errors
timestamp
```

Multi-agent request бол:

```text
Request
 ├── Orchestrator Trace
 ├── Maintenance Agent Trace
 ├── Warehouse Agent Trace
 └── Final Synthesis Trace
```

хэлбэртэй байна.

---

# 15. Agent evaluation

Agent бүр тусдаа evaluation suite-тай байна.

Үндсэн ангилал:

```text
Functional Evaluation
Security Evaluation
Tenant Isolation Evaluation
RAG Grounding Evaluation
Tool Selection Evaluation
Hallucination Evaluation
Authorization Evaluation
Action Safety Evaluation
Regression Evaluation
```

Domain тус бүр нэмэлт evaluation-тэй байж болно.

Жишээ нь Maintenance Agent:

- failure terminology accuracy
- WO interpretation
- asset history usage
- maintenance recommendation grounding.

---

# 16. Lifecycle

Agent lifecycle:

```text
Draft
 ↓
Development
 ↓
Evaluation
 ↓
Pilot
 ↓
Approved
 ↓
Production
 ↓
Monitor
 ↓
New Version
```

Agent prompt-ыг production дээр шууд overwrite хийхгүй.

Жишээ:

```text
maintenance-agent
v1.0
v1.1
v1.2
```

Version бүр audit-аар сэргээж болохуйц байна.

---

# 17. Pilot architecture

Одоогийн батлагдсан priority-ийн дагуу:

### Pilot Phase 1

```text
AI Orchestrator
      │
      ├── General iBeX Agent
      ├── Maintenance Agent
      ├── Asset Agent
      └── Warehouse Agent
```

Эхний шатанд эдгээрээс цааш хүрээг хэт томруулахгүй.

### Phase 2

```text
Inspection Agent
PM Agent
HSE Agent
```

### Phase 3 / R&D

```text
PdM Agent
Predictive AI
Budget Agent
Project/Contract Agent
```

Ялангуяа **PdM production prediction** нь хангалттай historical/sensor/failure data болон validation байх хүртэл R&D/Pilot байна.

---

# 18. Agent request-ийн стандарт урсгал

Нийт request pipeline:

```text
1. User Request
       ↓
2. AI Gateway
       ↓
3. Identity + Tenant Validation
       ↓
4. Master Policy
       ↓
5. Orchestrator
       ↓
6. Domain Agent Selection
       ↓
7. Permission Validation
       ↓
8. RAG / Tool Retrieval
       ↓
9. Model Gateway
       ↓
10. Domain Reasoning
       ↓
11. Output Validation
       ↓
12. Human Approval if required
       ↓
13. Core Workflow / Response
       ↓
14. Audit
```

---

# 19. Agent Architecture-ийн гол дүрэм

Эдгээрийг **v1.0 architecture decisions** болгон тогтоох саналтай:

1. **One AI Platform, multiple specialized agents.**
2. Agent бол тусдаа бүтээгдэхүүн биш, platform capability.
3. Master Policy бүх agent-аас дээгүүр байна.
4. Orchestrator бүх routing болон multi-agent coordination-г удирдана.
5. Agent Core DB рүү шууд SQL хийхгүй.
6. Documents → RAG.
7. Live operational data → Controlled Tool/API.
8. Agent зөвхөн allowlisted tool ашиглана.
9. Tenant context trusted Gateway-аас ирнэ.
10. Agent tenant сонгох эсвэл таахгүй.
11. Cross-tenant context, RAG, cache, memory хориглоно.
12. Action tool → Core authorization/workflow.
13. AI recommendation ≠ approved engineering decision.
14. Multi-agent communication Orchestrator-аар дамжина.
15. Model Gateway provider abstraction хийнэ.
16. Agent, prompt, tool бүгд versioned байна.
17. Execution бүр audit trace-тай байна.
18. Agent бүр өөрийн evaluation suite-тай байна.
19. Production agent өөрөө capability/tool нэмэхгүй.
20. Architecture шинэ domain agent нэмэхэд үндсэн platform redesign шаардахгүй.

---

## v1.0-ийн байрлал

Одоогийн баримт бичгийн hierarchy-г:

```text
iBeX Hybrid Intelligent AI Platform
│
├── 01. Master AI Policy v1.0
│
├── 02. Agent Architecture v1.0        ← ОДОО
│
├── 03. AI Gateway Architecture
│
├── 04. RAG Architecture
│
├── 05. Tool/API Contract
│
├── 06. Model Gateway Architecture
│
├── 07. Security & Tenant Isolation
│
├── 08. Audit & Observability
│
├── 09. Evaluation Framework
│
└── 10. Pilot Implementation Plan
```

гэж авч явах нь цэгцтэй.

**Agent Architecture v1.0-ийн гол шийдвэр:**  
> **Domain бүрт тусдаа AI system байгуулахгүй. Нэг iBeX Hybrid Intelligent AI Platform дотор Orchestrator-аар удирдуулсан, тусгай prompt, tools, RAG scope, permissions, evaluation бүхий specialized domain agents ажиллана.**

Энэ хувилбарыг **Agent Architecture v1.0 baseline** гэж батлаад дараагийн баримт болох **AI Gateway Architecture v1.0** руу шилжихэд бэлэн бүтэц боллоо.
