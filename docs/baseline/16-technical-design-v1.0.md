# iBeX Hybrid Intelligent AI Platform — Technical Design v1.0

**Version:** 1.0  
**Status:** Approved / Architecture Baseline

# iBeX Hybrid Intelligent AI Platform  
## Technical Design v1.0

**Document Status:** Draft for Approval  
**Architecture Stage:** Pre-Implementation Technical Design  
**Target Scope:** Pilot  
**Version:** 1.0  
**Date:** 2026-09-22

---

# 1. Зорилго

Энэхүү Technical Design v1.0 баримт бичгийн зорилго нь батлагдсан:

- Master AI Policy v1.0
- Agent Architecture v1.0
- Tenant Security Contract v1.0
- AI Gateway Contract v1.0
- Tool/API Contract v1.0
- RAG Architecture v1.0
- Model Gateway Architecture v1.0
- Audit & Observability Architecture
- Evaluation Framework
- Pilot Domain Specifications v1.0
- General iBeX Agent Specification v1.0
- Maintenance Agent Specification v1.0
- Asset Agent Specification v1.0
- Warehouse Agent Specification v1.0
- Implementation Readiness Review v1.0

дээр тулгуурлан **iBeX Hybrid Intelligent AI Platform-ийн Pilot implementation хийх техникийн бүтцийг нарийвчлан тогтоох** юм.

Энэ баримт нь source code биш.

Энэ баримт батлагдсаны дараа implementation phase эхэлнэ.

---

# 2. Technical Design-ийн үндсэн зарчим

iBeX Hybrid Intelligent AI Platform нь Core iBeX-ээс тусдаа, бие даасан enterprise AI platform байна.

Үндсэн урсгал:

**User / Mobile / Core UI**  
↓  
**Core iBeX / BFF**  
↓  
**AI Gateway**  
↓  
**iBeX Hybrid Intelligent AI Platform**  
↓  
**AI Orchestrator**  
↓  
**Domain Agent**  
↓  
**RAG / Controlled Tool / Model Gateway**  
↓  
**Response / Proposed Action**  
↓  
**AI Gateway**  
↓  
**Core iBeX**

Үндсэн архитектурын дүрэм:

1. AI Platform Core database-д шууд SQL query хийхгүй.
2. Core iBeX нь System of Record байна.
3. Live operational data зөвхөн controlled API/tool-аар авна.
4. Documents болон approved knowledge нь RAG-аар ашиглагдана.
5. Tenant context зөвхөн trusted Core/Gateway-аас ирнэ.
6. Agent tenant сонгох, солих, таах эрхгүй.
7. AI recommendation нь approved engineering decision биш.
8. Write/action operation Core workflow болон authorization-аар дамжина.
9. Human approval шаардлагатай action-уудыг AI өөрөө гүйцэтгэхгүй.
10. Provider/model өөрчлөгдөхөд agent architecture дахин бичигдэхгүй.

---

# 3. Scope Classification

## 3.1 Current — батлагдсан архитектур

Дараах зүйлс архитектурын тогтсон baseline:

- Standalone AI Platform
- AI Gateway mediation
- Strict tenant isolation
- Trusted Context
- Domain agent architecture
- Multi-level prompt architecture
- Controlled Tool/API access
- RAG + live data separation
- Model Gateway abstraction
- Audit trail
- Human-in-the-loop
- Core iBeX system-of-record
- Tenant-aware cache, RAG, tools, logs
- Tenant Admin зөвхөн tenant-level AI access удирдах
- iBeX Admin global AI governance хийх

---

## 3.2 Pilot — Technical Design v1.0 implementation scope

Pilot-д:

### Platform

- AI Gateway integration
- AI Runtime
- AI Orchestrator
- Agent Registry
- Prompt Registry
- Model Gateway
- RAG Service
- Tool Runtime
- Authorization enforcement
- Audit/Observability
- Evaluation hooks

### Agents

1. General iBeX Agent
2. Maintenance Agent
3. Asset Agent
4. Warehouse Agent

### Tool capability

Pilot эхний шатанд голчлон **Read Tools**.

Action tools зөвхөн approved workflow болон human confirmation mechanism бэлэн болсон тохиолдолд limited pilot хэлбэрээр орж болно.

---

## 3.3 R&D

Pilot implementation-ийн гадна боловч архитектур дэмжих:

- Predictive Maintenance models
- anomaly detection
- condition-based prediction
- advanced multi-agent collaboration
- autonomous workflow planning
- adaptive model routing
- domain-specific small models
- semantic cache optimization

---

## 3.4 Future

- Inspection Agent
- PM Agent
- PdM Agent
- HSE Agent
- Budget Agent
- Project/Contract Agent
- broader agentic execution
- advanced predictive models
- cross-workflow intelligent planning

---

# 4. Logical Component Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   CORE iBeX                         │
│ User / Role / Permission / Tenant / Workflow       │
└──────────────────────┬──────────────────────────────┘
                       │
                 Approved Contract
                       │
┌──────────────────────▼──────────────────────────────┐
│                    AI GATEWAY                       │
│ Auth Context │ Validation │ Rate Limit │ Audit     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│            HYBRID INTELLIGENT AI PLATFORM          │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              AI ORCHESTRATOR                  │  │
│  └───────────────┬───────────────────────────────┘  │
│                  │                                  │
│     ┌────────────┼───────────────┐                  │
│     ▼            ▼               ▼                  │
│ General       Maintenance       Asset               │
│ Agent         Agent             Agent               │
│                  │                                  │
│                  ▼                                  │
│             Warehouse Agent                         │
│                                                     │
│ ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │
│ │RAG Service│ │Tool Runtime│ │  Model Gateway    │ │
│ └───────────┘ └───────────┘ └───────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ Security / Audit / Evaluation / Observability  ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

# 5. Runtime Service Structure

Pilot implementation-д AI Platform-ийг дараах logical services болгон салгана.

## 5.1 AI Runtime API

Үүрэг:

- AI Gateway-аас request хүлээн авах
- request schema validate хийх
- trusted context баталгаажуулах
- request_id propagation хийх
- orchestrator invocation хийх
- final response contract үүсгэх

AI Runtime нь business-specific reasoning хийхгүй.

---

# 6. Trusted Request Context

AI Platform-д орж ирэх бүх request дараах trusted context-тай байна.

```text
tenant_id
user_id
role
permissions[]
entitlements[]
session_id
request_id
channel
locale
```

Optional:

```text
timezone
device_context
core_reference
conversation_id
```

## 6.1 Дүрэм

Trusted context:

- user prompt-оос үүсэхгүй
- LLM өөрөө тодорхойлохгүй
- client application-аас шууд итгэхгүй
- зөвхөн Core/Gateway-аар validate хийгдсэн байна

Agent болон tool layer:

**tenant_id-г өөрчлөх боломжгүй.**

---

# 7. AI Orchestrator Design

AI Orchestrator нь бүх domain reasoning хийхгүй.

Үндсэн үүрэг:

1. Request intent тодорхойлох
2. Domain тодорхойлох
3. Agent сонгох
4. Agent capability шалгах
5. RAG хэрэгтэй эсэхийг тогтоох
6. Tool хэрэгтэй эсэхийг тогтоох
7. Action/read classification хийх
8. Permission pre-check хийх
9. Agent invocation хийх
10. Final result aggregation хийх

---

## 7.1 Orchestrator output

Internal routing decision:

```text
intent
domain
selected_agent
required_capabilities[]
rag_required
tool_candidates[]
action_class
risk_class
approval_required
```

Энэ metadata хэрэглэгчид default-аар харагдахгүй.

Audit system-д бүртгэгдэнэ.

---

# 8. Agent Registry

Agent бүр registry-д versioned definition-тэй байна.

Жишээ logical fields:

```text
agent_id
agent_version
status
supported_intents
required_permissions
allowed_tools
allowed_rag_scopes
prompt_version
default_model_policy
fallback_model_policy
evaluation_profile
```

Pilot Agent IDs:

```text
general_ibex
maintenance
asset
warehouse
```

Agent нь registry-д бүртгэлгүй tool ашиглах боломжгүй.

---

# 9. Domain Agent Runtime

Agent execution pipeline:

```text
Validated Request
      ↓
Master Policy
      ↓
Agent Policy
      ↓
Domain Context
      ↓
RAG / Tool Selection
      ↓
Model Execution
      ↓
Output Validation
      ↓
Policy Validation
      ↓
Response
```

Agent бүр:

- domain-specific instructions
- explicit tool allowlist
- RAG scope
- permission rules
- response schema
- evaluation profile

ашиглана.

---

# 10. Prompt Architecture

Prompt дараах 3 үндсэн түвшинтэй байна.

## Level 1 — Master AI Policy

Бүх agent-д immutable runtime policy.

Хамарна:

- security
- tenant isolation
- authorization
- confidentiality
- data ownership
- source trust
- hallucination handling
- prompt injection defense
- action restrictions
- human approval
- audit obligations

Domain prompt Master Policy-г override хийж болохгүй.

---

## Level 2 — Orchestrator Prompt

Зөвхөн routing болон capability selection.

Business answer үүсгэх нь үндсэн үүрэг биш.

---

## Level 3 — Domain Agent Prompt

Agent-specific:

- domain responsibility
- terminology
- business constraints
- tools
- knowledge scope
- uncertainty handling
- response requirements

---

# 11. Prompt Registry

Prompt-ууд code дотор hard-code хийхээс зайлсхийж versioned registry-аар удирдана.

Fields:

```text
prompt_id
prompt_version
agent_id
status
effective_date
content_hash
created_by
approved_by
change_reason
```

Status:

```text
draft
testing
approved
retired
```

Production runtime:

**approved prompt version** л ашиглана.

---

# 12. RAG Technical Design

## 12.1 RAG source

Pilot-д:

- iBeX Handbook
- approved procedures
- approved technical documents
- manuals
- approved standards
- controlled knowledge base

Live WO, Asset, Inventory зэрэг transactional data RAG-д шууд оруулахгүй.

---

# 13. RAG Ingestion Pipeline

```text
Approved Document
      ↓
Source Validation
      ↓
Document Parsing
      ↓
Metadata Extraction
      ↓
Chunking
      ↓
Embedding
      ↓
Tenant/Scope Metadata
      ↓
Vector Index
      ↓
Approved / Active
```

---

# 14. RAG Metadata

Chunk бүр дор хаяж:

```text
tenant_scope
document_id
document_version
document_type
domain
access_scope
source_status
effective_date
chunk_id
```

Global/common document бол explicit:

```text
tenant_scope = GLOBAL_APPROVED
```

байна.

Global гэсэн ойлголтыг agent өөрөө шийдэхгүй.

---

# 15. Tenant Isolation in RAG

Retrieval хийх үед filter:

```text
requested_tenant
+
authorized_global_sources
+
agent_scope
+
permission_scope
```

байна.

Search → retrieve → rerank бүх шатанд tenant filter мөрдөгдөнө.

Cross-tenant retrieval **fail closed** байна.

---

# 16. RAG Retrieval Result

Agent-д citation-ready structure өгнө.

Logical structure:

```text
source_id
document_name
document_version
chunk_id
content
relevance
scope
effective_date
```

Agent source-гүй assertion хийх шаардлагатай үед:

- factual certainty багасгах
- assumption гэж тэмдэглэх
- шаардлагатай бол хариу өгөхөөс татгалзах

зарчим хэрэглэнэ.

---

# 17. Tool Runtime

Tool Runtime нь agent болон Core API-ийн хоорондох controlled execution layer байна.

Agent Core API-г дур мэдэн дуудахгүй.

Урсгал:

```text
Agent
 ↓
Tool Request
 ↓
Tool Registry
 ↓
Authorization Check
 ↓
Schema Validation
 ↓
Core API
 ↓
Output Validation
 ↓
Audit
 ↓
Agent
```

---

# 18. Tool Registry

Tool бүр:

```text
tool_id
tool_version
domain
classification
input_schema
output_schema
required_permissions
tenant_scoped
approval_policy
timeout
audit_level
```

Classification:

```text
READ
ACTION
```

---

# 19. Read Tool

Read tool:

- data уншина
- Core state өөрчлөхгүй
- tenant-aware
- permission-aware
- audited

Жишээ:

```text
asset.get
asset.search
maintenance.wo.get
maintenance.history.get
warehouse.inventory.get
warehouse.part.search
```

Эдгээр нь conceptual identifiers бөгөөд actual API contract implementation phase-д versioned endpoint-тэй холбогдоно.

---

# 20. Action Tool

Action tool нь state change санал болгоно эсвэл approved workflow эхлүүлнэ.

Жишээ future/pilot-limited:

```text
maintenance.wo.propose_update
maintenance.request.propose
warehouse.issue.propose
```

AI шууд protected Core record update хийхгүй.

Action flow:

```text
AI Proposal
   ↓
Authorization
   ↓
Approval Required?
   ↓
Human Confirmation
   ↓
Core Workflow
   ↓
Core Executes
```

---

# 21. Authorization Enforcement

Authorization 3 түвшинд хийгдэнэ.

### Layer 1
AI Gateway pre-validation

### Layer 2
AI Platform capability/tool permission check

### Layer 3
Core iBeX authoritative permission check

Core permission check нь final authority байна.

AI Platform permission мэдээллийг security bypass болгон ашиглахгүй.

---

# 22. Model Gateway

Agent provider-specific SDK-г шууд ашиглахгүй.

Урсгал:

```text
Agent
 ↓
Model Request
 ↓
Model Gateway
 ↓
Routing Policy
 ↓
Provider Adapter
 ↓
LLM
```

Model Gateway provider abstraction хийнэ.

---

# 23. Model Request Contract

Logical fields:

```text
request_id
tenant_context_reference
agent
task_type
reasoning_level
confidentiality_class
latency_priority
cost_policy
input
tool_capability
structured_output_schema
```

Raw tenant secrets model request-д орохгүй.

---

# 24. Model Selection Policy

Model сонголтыг:

- task complexity
- reasoning requirement
- latency
- cost
- confidentiality
- tool capability
- context size
- provider availability

дээр үндэслэнэ.

Pilot эхний routing policy-г intentionally simple байлгана.

Complex adaptive routing нь R&D.

---

# 25. Provider Adapter

Provider бүр standardized interface хэрэгжүүлнэ.

Conceptually:

```text
generate()
generate_structured()
tool_call()
health_check()
usage()
```

Provider-specific response agent layer руу шууд дамжуулахгүй.

Gateway canonical format руу хөрвүүлнэ.

---

# 26. Conversation Context

Conversation state tenant-aware байна.

Key structure conceptual:

```text
tenant_id
user_id
conversation_id
session_id
```

Conversation history:

- permission scope өөрчлөгдвөл дахин validate хийнэ
- tenant хооронд reuse хийхгүй
- tool result-ийг indefinite memory болгохгүй
- sensitive operational context minimum шаардлагатай хугацаагаар хадгална

---

# 27. Cache Architecture

Cache ашигласан тохиолдолд key minimum:

```text
tenant_id
user_id/role scope
agent
permission scope
request class
```

Tenant-independent cache зөвхөн:

- public
- approved
- non-sensitive
- explicitly global

мэдээлэлд хэрэглэгдэнэ.

Semantic cache Pilot-д optional.

---

# 28. Output Validation Layer

Model response хэрэглэгч рүү шууд гарахгүй.

Output pipeline:

```text
Model Output
 ↓
Schema Validation
 ↓
Tenant/Data Leak Check
 ↓
Policy Check
 ↓
Unsupported Action Check
 ↓
Citation/Source Check
 ↓
Response Formatter
```

Validation fail болсон үед:

- retry
- safer fallback
- explicit failure

гэсэн controlled strategy ашиглана.

---

# 29. Response Contract

Final AI response conceptual structure:

```text
request_id
status
agent
response
sources[]
assumptions[]
limitations[]
proposed_actions[]
approval_required
```

UI бүх metadata-г заавал харуулахгүй.

Audit record full metadata хадгална.

---

# 30. Hallucination Handling

Agent:

1. Source байгаа эсэх
2. Live tool хэрэгтэй эсэх
3. Data хүрэлцээтэй эсэх
4. Assumption шаардлагатай эсэх

дарааллаар үнэлнэ.

Data байхгүй үед:

**зохиомол operational value үүсгэхгүй.**

Жишээ:

> “Энэ asset-ийн сүүлийн ажиллагааны мэдээлэл tool result-д байхгүй тул одоогийн төлөвийг баталгаатай тодорхойлох боломжгүй.”

гэсэн controlled uncertainty ашиглана.

---

# 31. Prompt Injection Defense

Trust priority:

1. Master AI Policy
2. Platform Security Policy
3. Trusted Gateway Context
4. Agent Policy
5. Tool schema
6. Approved RAG source
7. Tool output
8. User input
9. External/untrusted content

Document дотор:

> “Ignore previous instructions”

гэх мэт текст байсан ч system policy гэж үзэхгүй.

RAG content **data** бөгөөд instruction authority биш.

---

# 32. Audit Architecture

AI request бүр correlation хийх боломжтой байна.

Audit fields:

```text
request_id
tenant_id
user_id
session_id
agent
agent_version
prompt_version
model_provider
model
tools_used
rag_sources
action_class
approval_state
response_status
input_tokens
output_tokens
estimated_cost
latency
error_code
timestamp
```

Sensitive content-ийг бүхэлд нь log хийх шаардлагагүй.

Data minimization мөрдөнө.

---

# 33. Observability

Platform minimum metrics:

### Availability
- request count
- success rate
- error rate

### Performance
- total latency
- model latency
- tool latency
- RAG latency

### Model
- tokens
- provider errors
- fallback count

### Security
- rejected requests
- unauthorized tool attempts
- tenant mismatch
- policy violations

### Cost
- cost/request
- cost/tenant
- cost/agent
- monthly usage

---

# 34. Error Handling

Canonical error classes:

```text
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
TENANT_CONTEXT_ERROR
VALIDATION_ERROR
AGENT_ROUTING_ERROR
RAG_ERROR
TOOL_ERROR
MODEL_ERROR
POLICY_ERROR
APPROVAL_REQUIRED
RATE_LIMIT
TIMEOUT
INTERNAL_ERROR
```

Client рүү internal stack trace гаргахгүй.

---

# 35. Resilience

## Model failure

Primary model fail → approved fallback model.

## Tool failure

Agent operational value зохиохгүй.

## RAG failure

Source-dependent answer гэдгийг мэдэгдэж controlled fallback хийнэ.

## Core unavailable

Write/action хийхгүй.

## Gateway context invalid

Request reject.

---

# 36. General iBeX Agent — Technical Mapping

General Agent:

- system navigation assistance
- general iBeX knowledge
- cross-domain high-level assistance
- intent routing support
- approved documentation Q&A

Allowed:

- General RAG
- limited read tools

Not allowed:

- specialized maintenance engineering conclusion
- inventory transaction execution
- protected workflow bypass

Domain-specific request илэрвэл specialized agent руу route хийнэ.

---

# 37. Maintenance Agent — Technical Mapping

Scope:

- WO lookup
- maintenance history
- failure history
- maintenance context analysis
- planning support
- execution information
- recommendation

Data:

```text
WO tools
maintenance history tools
asset context
approved maintenance RAG
```

Excluded:

- PM scheduling engine ownership
- PdM prediction engine ownership
- autonomous WO approval
- direct Core update

---

# 38. Asset Agent — Technical Mapping

Scope:

- asset information
- hierarchy
- location
- technical attributes
- maintenance context linkage
- approved manuals/documentation

Data:

```text
asset tools
location/hierarchy tools
maintenance summary tools
asset RAG
```

Asset Agent system of record биш.

---

# 39. Warehouse Agent — Technical Mapping

Scope:

- warehouse
- inventory
- parts
- availability
- stock context
- part lookup
- WO material context

Pilot primary capability:

**read and recommendation**

Inventory Issue/Receipt state-changing action Core workflow-аар шийдэгдэнэ.

---

# 40. Agent-to-Agent Interaction

Pilot-д unrestricted agent-to-agent messaging хийхгүй.

Orchestrator төв routing point байна.

Зөвшөөрөгдөх хэлбэр:

```text
User Request
 → Orchestrator
 → Agent A
 → Orchestrator
 → Agent B
```

хэрэв cross-domain шаардлагатай бол.

Agent A Agent B-г шууд дур мэдэн invoke хийхгүй.

Advanced multi-agent collaboration → R&D.

---

# 41. Persistence

AI Platform өөрийн operational metadata storage-тэй байж болно.

Хадгалж болох:

- audit
- prompt versions
- agent registry
- tool registry
- model config
- evaluation results
- RAG metadata
- conversation metadata
- usage metrics

Харин Core operational records-ийн duplicate system-of-record үүсгэхгүй.

---

# 42. AI Platform Data Categories

### Platform Configuration
AI configuration

### Governance Data
prompt/model/policy versions

### AI Operational Metadata
request, latency, usage

### RAG Data
approved document chunks/embeddings

### Conversation Data
controlled AI context

### Evaluation Data
test/result datasets

### Core Operational Data
AI Platform-ийн ownership биш.

---

# 43. API Versioning

Бүх external contract versioned байна.

Жишээ:

```text
/api/ai/v1/...
```

Tool contracts:

```text
tool_version = 1
```

Breaking change:

- шинэ major version
- backward compatibility policy
- migration period

шаардана.

---

# 44. Idempotency

Action request-д:

```text
request_id
idempotency_key
```

ашиглана.

Retry үед нэг action давхардахгүй.

Ялангуяа future write/action flow-д mandatory.

---

# 45. Rate Limiting

Rate limit дараах түвшинд хэрэглэж болно:

- user
- tenant
- agent
- model provider
- expensive tool
- global system

Cost budget-тай уялдана.

Tenant A rate spike Tenant B-г нөлөөлөхгүй байх архитектур сонгоно.

---

# 46. Cost Governance

Minimum:

```text
global monthly limit
provider usage
tenant usage
agent usage
request usage
token usage
```

Admin боломж:

- AI globally disable
- provider disable
- model disable
- tenant AI disable
- agent disable
- cost threshold alerts

Tenant Admin global model/cost policy өөрчлөхгүй.

---

# 47. Configuration Management

Environment:

```text
LOCAL
DEVELOPMENT
STAGING
PRODUCTION
```

Environment бүр:

- separate secrets
- separate endpoints
- separate model configuration
- separate vector indexes
- separate logs/audit

ашиглана.

Production data development environment-д автоматаар хуулбарлахгүй.

---

# 48. Secret Management

API key, credential:

- source code-д hard-code хийхгүй
- prompt-д хадгалахгүй
- client рүү илгээхгүй
- centralized secret management ашиглана

Secret access:

**least privilege**.

---

# 49. Deployment Architecture

Pilot deployment conceptual:

```text
Load Balancer / Gateway
        ↓
AI Runtime
 ├── Orchestrator
 ├── Agent Runtime
 ├── Tool Runtime
 ├── RAG Service
 └── Model Gateway

Supporting:
 ├── AI Metadata DB
 ├── Vector Store
 ├── Cache
 ├── Audit Store
 └── Observability
```

Logical modules эхний Pilot-д заавал physical microservices байх албагүй.

---

# 50. Modular Monolith vs Microservices

Pilot-д санал болгож буй implementation:

**Modular AI Platform service with strict internal module boundaries.**

Шалтгаан:

- implementation complexity бага
- audit/control хялбар
- Pilot хурдан validate хийх
- unnecessary distributed complexity-оос зайлсхийх

Гэхдээ interfaces:

- Orchestrator
- RAG
- Tools
- Model Gateway
- Audit

тусдаа module contract-тай байна.

Дараа нь шаардлагатай service-үүдийг independent deployment болгон салгаж болно.

---

# 51. Recommended Logical Repository Structure

Conceptual:

```text
ibex-ai-platform/
│
├── platform/
│   ├── runtime/
│   ├── orchestrator/
│   ├── security/
│   ├── policy/
│   └── responses/
│
├── agents/
│   ├── general/
│   ├── maintenance/
│   ├── asset/
│   └── warehouse/
│
├── rag/
│
├── tools/
│   ├── registry/
│   ├── core/
│   └── validation/
│
├── model_gateway/
│   ├── routing/
│   └── providers/
│
├── audit/
│
├── evaluation/
│
├── contracts/
│
├── tests/
│
└── config/
```

Энэ нь conceptual design.

Actual framework/language implementation phase-д баталгаажна.

---

# 52. Security Boundary

AI Platform дараах trust zones-ийг ялгана.

### Trusted
- Core identity
- AI Gateway context
- approved policy/config

### Controlled
- registered tools
- approved RAG

### Untrusted
- user prompt
- uploaded content until validated
- external content
- raw model output

Untrusted content security policy өөрчлөх эрхгүй.

---

# 53. Tenant Isolation Test Requirements

Заавал test хийх:

1. Tenant A → Tenant B asset access attempt
2. cross-tenant RAG retrieval
3. cached Tenant A response Tenant B-д гарах эсэх
4. forged tenant_id
5. tool argument tenant override
6. conversation context leakage
7. audit cross-tenant access
8. embedding/vector filter bypass
9. role/permission change during active session
10. model context contamination

Expected default:

**deny / fail closed.**

---

# 54. Evaluation Integration

Evaluation нь implementation-ийн дараах нэмэлт биш.

Agent runtime version бүр evaluation profile-той байна.

Evaluation categories:

- factual correctness
- source grounding
- tool correctness
- tenant isolation
- permission adherence
- hallucination
- unsafe action prevention
- routing accuracy
- response usefulness
- latency
- cost

---

# 55. Golden Test Set

Pilot agent бүр approved test dataset-тэй байна.

### General
- FAQ
- navigation
- domain routing

### Maintenance
- WO
- history
- failure analysis context

### Asset
- hierarchy
- asset details
- manuals

### Warehouse
- part search
- stock
- availability

Tenant/security adversarial tests тусдаа dataset байна.

---

# 56. CI Quality Gates

Merge/deployment өмнө minimum:

```text
unit tests
contract tests
security tests
tenant isolation tests
agent evaluations
tool schema tests
prompt regression tests
```

Critical security regression fail → deployment block.

---

# 57. Deployment Gate

Production deployment хийхийн өмнө:

- Technical Design approved
- API contracts implemented
- security tests pass
- tenant isolation pass
- tool allowlist verified
- approved prompt versions
- model config approved
- audit operational
- rollback tested
- evaluation threshold pass

байх шаардлагатай.

---

# 58. Pilot Rollout

Rollout sequence:

### Phase 1 — Local

Mock Core APIs.

### Phase 2 — Development

Development Core integration.

### Phase 3 — Controlled Test

Internal test users.

### Phase 4 — Shadow Mode

AI recommendation гаргана, operational action хийхгүй.

### Phase 5 — Limited Pilot

Selected tenant/users.

### Phase 6 — Pilot Review

Quality, security, cost, operational feedback.

Production general availability нь тусдаа approval шаардана.

---

# 59. Feature Flags

Capability controlled flags:

```text
ai_enabled
agent_general_enabled
agent_maintenance_enabled
agent_asset_enabled
agent_warehouse_enabled
rag_enabled
action_tools_enabled
```

Tenant-level enablement болон global platform control тусдаа байна.

Global disable > tenant enable.

---

# 60. Human Approval Architecture

Action proposal object conceptual:

```text
proposal_id
request_id
tenant_id
user_id
agent
action_type
target
proposed_changes
reason
source_context
approval_required
expires_at
```

Approval Core workflow-д хийгдэнэ.

AI approval state-г өөрөө өөрчлөхгүй.

---

# 61. Mobile Integration

Mobile App тусдаа AI backend/model ашиглахгүй.

Урсгал:

```text
Mobile
 ↓
Mobile BFF / Core
 ↓
AI Gateway
 ↓
AI Platform
```

Device дээр:

- provider API key байхгүй
- direct model call байхгүй
- tenant policy bypass байхгүй

---

# 62. Data Retention

Retention нь data classification-аар өөр байна.

Тусдаа policy шаардлагатай:

- conversation
- raw prompt
- tool output
- audit metadata
- RAG document
- evaluation traces

Security audit-д шаардлагатай metadata болон user content retention-ийг адил хугацаатай гэж үзэхгүй.

---

# 63. Backup and Recovery

Critical platform configuration backup:

- Prompt Registry
- Agent Registry
- Tool Registry
- Policy versions
- RAG metadata
- Audit configuration

Vector index source document-оос regenerate боломжтой байх.

Core operational database AI Platform backup-ийн ownership биш.

---

# 64. Rollback

Rollback-able artifacts:

- application version
- agent version
- prompt version
- tool version
- model routing configuration
- RAG index version

Version бүр traceable байна.

Audit-аас:

**ямар request ямар version ашигласныг** тодорхойлох боломжтой байна.

---

# 65. Change Management

Өөрчлөлт бүр:

```text
Requirement
→ Risk
→ Architecture impact
→ Tenant/Security impact
→ Data impact
→ Tool/API impact
→ Human approval impact
→ Cost
→ Evaluation
→ Implementation
```

дарааллаар үнэлэгдэнэ.

Шууд production prompt/tool/model өөрчлөхгүй.

---

# 66. Pilot Non-Goals

Technical Design v1.0 дараахыг production scope гэж үзэхгүй:

- fully autonomous maintenance
- autonomous inventory transaction
- predictive failure model
- unrestricted multi-agent execution
- direct SQL/database access
- client-side AI provider access
- automatic engineering approval
- tenant-to-tenant learning
- customer data model training
- self-modifying agent policy

---

# 67. Implementation Work Packages

Technical Design батлагдсаны дараах implementation дараалал:

## WP-01 — Platform Foundation

- project structure
- configuration
- contract schemas
- request lifecycle

## WP-02 — Security Context

- trusted context
- tenant enforcement
- permission middleware

## WP-03 — Model Gateway

- canonical interface
- provider adapter
- routing
- usage metrics

## WP-04 — Prompt/Agent Registry

- Master Policy
- Orchestrator
- Pilot agents

## WP-05 — RAG

- ingestion
- metadata
- retrieval
- citation

## WP-06 — Tool Runtime

- registry
- validation
- Core adapters
- read tools

## WP-07 — Audit/Observability

- audit event
- metrics
- correlation

## WP-08 — Evaluation

- golden datasets
- security tests
- regression

## WP-09 — Core Integration

- AI Gateway
- Core tools
- authorization

## WP-10 — Pilot Agents

- General
- Maintenance
- Asset
- Warehouse

## WP-11 — Controlled Pilot

- shadow mode
- limited users
- evaluation

---

# 68. Implementation Dependency Order

```text
Contracts
   ↓
Security Context
   ↓
Runtime Foundation
   ↓
Model Gateway
   ↓
Audit
   ↓
Orchestrator
   ↓
RAG + Tool Runtime
   ↓
Domain Agents
   ↓
Evaluation
   ↓
Core Integration
   ↓
Shadow Pilot
```

Domain agents-ийг platform security-ээс өмнө production logic болгон бичихгүй.

---

# 69. Open Technical Decisions Before Coding

Implementation эхлэхээс өмнө дараах implementation-level сонголтыг баталгаажуулна.

### TD-01
AI Platform implementation language/framework

### TD-02
AI Metadata database technology

### TD-03
Vector store technology

### TD-04
Cache technology

### TD-05
Secret management solution

### TD-06
Observability stack

### TD-07
Deployment platform/container strategy

### TD-08
Initial Model Gateway provider configuration

### TD-09
Core AI Gateway transport/authentication mechanism

### TD-10
Initial document ingestion pipeline implementation

Эдгээр нь архитектурын үндсэн зарчмыг өөрчлөхгүй implementation decisions байна.

---

# 70. Readiness Gate for Coding

Coding эхлэхийн өмнө дараах checklist бүрэн байна.

- [ ] Technical Design v1.0 approved
- [ ] Pilot scope frozen
- [ ] Trusted Context schema approved
- [ ] AI Gateway request/response schema approved
- [ ] Core authentication approach approved
- [ ] Tool Registry initial list approved
- [ ] Read tool endpoints identified
- [ ] RAG source set identified
- [ ] Master Policy approved
- [ ] Four Pilot Agent specifications approved
- [ ] Model Gateway baseline selected
- [ ] Audit event schema approved
- [ ] Evaluation minimum thresholds approved
- [ ] Environment strategy approved
- [ ] Secret strategy approved
- [ ] Rollback/versioning strategy approved

---

# 71. Architecture Decision Summary

Technical Design v1.0 дараах үндсэн шийдвэрүүдийг тогтооно.

**TD-A01**  
iBeX Hybrid Intelligent AI нь standalone platform байна.

**TD-A02**  
Core access зөвхөн AI Gateway болон controlled tools/API-аар хийгдэнэ.

**TD-A03**  
AI Core database-д шууд SQL access хийхгүй.

**TD-A04**  
Trusted tenant/user/security context Core/Gateway-аас ирнэ.

**TD-A05**  
Domain agents unified platform security/governance ашиглана.

**TD-A06**  
RAG document knowledge-д, tools live operational data-д хэрэглэгдэнэ.

**TD-A07**  
Provider abstraction Model Gateway-аар хийгдэнэ.

**TD-A08**  
Pilot эхний implementation read-oriented байна.

**TD-A09**  
Protected action human/Core workflow approval шаардана.

**TD-A10**  
Audit, security, evaluation implementation-ийн салшгүй хэсэг байна.

**TD-A11**  
Pilot implementation modular platform хэлбэрээр эхэлж, unnecessary microservice complexity үүсгэхгүй.

**TD-A12**  
General, Maintenance, Asset, Warehouse нь эхний Pilot agents байна.

---

# 72. Technical Design Acceptance Criteria

Technical Design v1.0 accepted гэж үзэхийн тулд:

1. Core/AI boundary тодорхой
2. Tenant security enforcement тодорхой
3. Runtime flow тодорхой
4. Agent boundaries тодорхой
5. RAG/live data separation тодорхой
6. Tool execution rules тодорхой
7. Model abstraction тодорхой
8. Human approval boundary тодорхой
9. Audit requirements тодорхой
10. Evaluation gate тодорхой
11. Deployment/rollback strategy тодорхой
12. Coding work-package order тодорхой

байх ёстой.

---

# 73. Final Target Architecture

Энэхүү Technical Design-ийн зорилтот бүтэц:

**One iBeX Hybrid Intelligent AI Platform**

дотор:

- one controlled AI entry point
- one trusted security context
- one orchestration layer
- multiple specialized domain agents
- tenant-isolated RAG
- controlled operational tools
- provider-independent Model Gateway
- auditable agent execution
- human-governed actions
- extensible predictive capability

ажиллана.

Энэ нь олон тусдаа chatbot-ын систем биш.

Энэ нь:

> **нэгдсэн orchestration + strict tenant isolation + controlled Core access + governed intelligence**

дээр суурилсан enterprise AI architecture байна.

---

# 74. Technical Design v1.0 Status

**Current:** Architecture and governance baseline approved previously.

**Pilot:**  
General iBeX Agent, Maintenance Agent, Asset Agent, Warehouse Agent болон тэдгээрийг ажиллуулах common AI Platform foundation.

**R&D:**  
Predictive AI, advanced agent collaboration, adaptive routing.

**Future:**  
Inspection, PM, PdM, HSE, Budget, Project/Contract болон additional domain intelligence.

---

# 75. Next Formal Step

Technical Design v1.0 батлагдсаны дараа дараагийн шат:

**Implementation Specification / Development Baseline v1.0**

байна.

Тус баримтад:

- technology selections
- repository/module boundaries
- interface schemas
- API endpoint mapping
- initial tool inventory
- environment variables
- database schemas
- deployment definitions
- test structure
- implementation sequence

нарийвчлагдана.

Үүний дараа л production implementation source code эхэлнэ.

---

## Technical Design v1.0 — Conclusion

iBeX Hybrid Intelligent AI Platform-ийн Pilot implementation нь:

**Core iBeX-ээс тусгаарлагдсан,  
AI Gateway-аар хамгаалагдсан,  
tenant-aware,  
tool-controlled,  
RAG-grounded,  
provider-independent,  
auditable,  
human-governed**

архитектур дээр хэрэгжинэ.

Technical Design v1.0 нь Pilot implementation эхлүүлэх техникийн үндсэн baseline болно.
