# iBeX Hybrid Intelligent AI Platform — AI Gateway Contract v1.0

**Version:** 1.0  
**Status:** Approved / Architecture Baseline  
**Scope:** Core iBeX ↔ AI Gateway ↔ iBeX Hybrid Intelligent AI Platform  
**Implementation status:** Production code эхлээгүй  
**Related contracts:**  
- Master AI Policy v1.0  
- Tenant Security Contract v1.0  
- Agent Architecture v1.0  

---

# 1. Зорилго

AI Gateway Contract нь **Core iBeX болон iBeX Hybrid Intelligent AI Platform хоорондын цорын ганц батлагдсан integration boundary**-г тодорхойлно.

Үндсэн архитектур:

**Core iBeX → AI Gateway → iBeX Hybrid Intelligent AI Platform**

AI Gateway-ийн зорилго нь:

- trusted identity болон tenant context дамжуулах;
- authorization boundary хамгаалах;
- AI request/response schema стандартчилах;
- AI Platform-д зөвхөн батлагдсан өгөгдөл, tool access өгөх;
- AI action-ийг Core workflow-аас гадуур гүйцэтгүүлэхгүй байх;
- request бүрийг audit хийх;
- Core болон AI Platform-ийг технологийн хувьд сул хамааралтай байлгах;
- model/provider өөрчлөгдсөн ч Core integration contract-ийг тогтвортой хадгалах.

---

# 2. Архитектурын үндсэн дүрэм

AI Gateway нь Core iBeX болон AI Platform-ийн хооронд байрлах **security, policy, integration boundary** байна.

```text
User / Mobile / Web
        │
        ▼
     Core iBeX
        │
        ▼
    AI Gateway
        │
        ▼
AI Orchestrator
        │
 ┌──────┼─────────────┐
 ▼      ▼             ▼
General Maintenance  Asset ...
Agent    Agent        Agent
        │
        ▼
   Model Gateway
        │
 OpenAI / OSS / Future
```

AI Platform:

- Core database руу шууд SQL query хийхгүй.
- Core service-ийн internal database credential авахгүй.
- browser/mobile client-ээс шууд trusted tenant context авахгүй.
- Core-ийн authorization logic-ийг LLM-ээр орлуулахгүй.
- Core workflow-г тойрч action гүйцэтгэхгүй.

**Core iBeX нь System of Record хэвээр байна.**

---

# 3. AI Gateway-ийн хариуцлага

AI Gateway дараах үндсэн үүрэгтэй.

### 3.1 Identity Context Validation

Gateway AI request бүрд дараах trusted context байгаа эсэхийг баталгаажуулна:

- `tenant_id`
- `user_id`
- `role`
- `permissions`
- `entitlements`
- `session_id`
- `request_id`

Эдгээрийг хэрэглэгчийн prompt, browser, mobile client эсвэл LLM өөрөө тогтоохгүй.

Trusted context зөвхөн баталгаажсан **Core iBeX authentication/authorization layer**-аас үүснэ.

---

### 3.2 Tenant Enforcement

Gateway:

- tenant context байхгүй хүсэлтийг AI Platform руу дамжуулахгүй;
- tenant context солихыг хориглоно;
- client-supplied tenant override-г үл тооцно;
- request болон tool operation-ийн tenant scope таарч байгаа эсэхийг шалгана;
- cross-tenant request-ийг reject хийнэ.

Agent, LLM эсвэл хэрэглэгч:

**tenant сонгох, таах, өөрчлөх эрхгүй.**

---

### 3.3 Authorization Enforcement

Gateway болон Core authorization layer нь AI хүсэлтийг:

- хэрэглэгч;
- role;
- permission;
- entitlement;
- capability;
- tenant configuration

дээр үндэслэн шалгана.

LLM-ийн:

> “User is probably allowed”

гэсэн reasoning нь authorization болохгүй.

**Authorization = deterministic server-side control.**

---

# 4. Request Envelope

Core-оос AI Gateway руу илгээгдэх бүх хүсэлт стандарт request envelope ашиглана.

## 4.1 Mandatory fields

| Field | Тайлбар |
|---|---|
| `contract_version` | Gateway contract version |
| `request_id` | Давтагдашгүй request identifier |
| `tenant_id` | Trusted tenant identifier |
| `user_id` | Authenticated user |
| `role` | Core-оос тогтоосон role |
| `permissions` | Баталгаажсан permission set |
| `entitlements` | Tenant/user AI entitlement |
| `session_id` | AI conversation/session scope |
| `timestamp` | Request үүссэн хугацаа |
| `channel` | web / mobile / system |
| `locale` | mn / en гэх мэт |
| `payload` | Хэрэглэгчийн AI request |

Шаардлагатай тохиолдолд:

- `correlation_id`
- `source_module`
- `source_entity_type`
- `source_entity_id`
- `requested_capability`
- `client_context`

нэмэгдэж болно.

---

# 5. Trusted ба Untrusted Data

AI Gateway өгөгдлийг trust level-ээр ялгана.

## Trusted

- authenticated user identity;
- tenant identity;
- permissions;
- entitlements;
- Core-generated entity identifiers;
- approved API/tool responses;
- approved system configuration.

## Untrusted

- user prompt;
- uploaded file content;
- RAG document content;
- external document;
- email/text;
- tool-returned free text;
- webpage content;
- model-generated content.

**Untrusted content Master AI Policy, tenant policy эсвэл authorization rule-г override хийж болохгүй.**

---

# 6. Capability Routing

Client нь AI agent-ийг шууд эрх мэдэлтэйгээр сонгохгүй.

Жишээлбэл хэрэглэгч:

> “Maintenance Agent ашигла.”

гэж prompt-д бичсэн ч энэ нь зөвхөн request hint байна.

Final routing:

**AI Gateway → AI Orchestrator → Authorized Domain Agent**

зарчмаар явагдана.

Routing-д:

- user permission;
- tenant entitlement;
- requested capability;
- source module;
- intent;
- domain;
- agent availability

харгалзана.

---

# 7. Read Tool Contract

Operational live data авахдаа RAG биш **Controlled Read Tool/API** ашиглана.

Жишээ:

- Asset lookup
- Work Order lookup
- PM lookup
- PdM history
- Inspection
- Inventory
- Parts
- Datahub
- Budget
- Project
- Contract
- HSE

Read Tool бүр:

- tool name;
- version;
- input schema;
- output schema;
- tenant scope;
- required permissions;
- allowed fields;
- data classification;
- timeout;
- audit rule

тодорхой байна.

AI arbitrary endpoint эсвэл SQL query үүсгэн дуудахгүй.

---

# 8. Action Tool Contract

Write/update/state-changing operation нь Read Tool-ээс тусдаа байна.

Action Tool жишээ:

- WO draft үүсгэх;
- inspection follow-up санал үүсгэх;
- spare preparation request үүсгэх;
- approved workflow руу draft оруулах.

Action Tool бүрд заавал:

- explicit permission;
- tenant validation;
- input validation;
- idempotency protection;
- audit;
- workflow validation

хийгдэнэ.

Шаардлагатай operation нь:

**AI Recommendation → Human Approval → Core Authorization → Core Action**

дарааллаар ажиллана.

AI өөрөө engineering approval authority болохгүй.

---

# 9. Human Approval

AI response дараах гурван ангиллын аль нэг байна.

### A. Informational

Зөвхөн тайлбар, lookup, summary.

Approval шаардлагагүй.

### B. Recommendation

AI санал, recommendation, diagnosis candidate, planning suggestion.

Core data автоматаар өөрчлөгдөхгүй.

### C. Proposed Action

Core system-д өөрчлөлт оруулах санал.

Action нь Core workflow-аар баталгаажсаны дараа л execution хийнэ.

AI:

- approval зохиохгүй;
- approval status өөрчлөхгүй;
- approver impersonation хийхгүй.

---

# 10. Response Envelope

AI Platform → Gateway → Core response нь стандарт metadata агуулна.

Үндсэн талбарууд:

| Field | Тайлбар |
|---|---|
| `contract_version` | Contract version |
| `request_id` | Original request |
| `status` | success / partial / rejected / error |
| `response` | AI output |
| `agent` | Ашигласан agent |
| `sources` | Ашигласан approved sources |
| `tools_used` | Tool execution summary |
| `action_type` | informational/recommendation/proposed_action |
| `approval_required` | true/false |
| `warnings` | Limitation / uncertainty |
| `trace_id` | Audit correlation |

Predictive capability ашигласан үед боломжтой бол:

- confidence;
- model version;
- source-data period;
- assumptions;
- limitations

мөн дамжуулна.

---

# 11. Source Transparency

AI response нь боломжтой үед мэдээллийн эх сурвалжийг ялгана:

- RAG document;
- Core live data;
- deterministic rule;
- predictive model;
- LLM reasoning.

AI эх сурвалжгүй operational fact зохиохгүй.

Data олдохгүй үед:

**“Өгөгдөл хангалтгүй”**

гэж мэдээлэх нь зөв behavior байна.

---

# 12. RAG Contract

RAG-д зөвхөн батлагдсан knowledge source ашиглана.

Жишээ:

- iBeX Handbook;
- approved procedure;
- manual;
- engineering standard;
- approved internal knowledge document.

Retrieval бүр:

`tenant_id + document_scope + permission`

хязгаарт байна.

Tenant-specific document:

өөр tenant-ийн vector index, retrieval result, context эсвэл cache-д орохгүй.

---

# 13. Live Operational Data

Live operational data:

- WO;
- Asset;
- PM;
- PdM;
- Inspection;
- Inventory;
- Datahub;
- Budget;
- Project;
- Contract;
- HSE

зэрэг мэдээллийг **Controlled Tool/API**-аар авна.

Transactional Core data-г шууд vector database руу хуулж RAG болгохгүй.

Үндсэн дүрэм:

**Documents → RAG**

**Live operational data → Controlled Tools/APIs**

---

# 14. Prompt Injection Protection

Gateway болон AI Platform дараах instruction hierarchy-г мөрдөнө:

1. Master AI Policy
2. Tenant Security Policy
3. Agent Architecture / Orchestrator Policy
4. Domain Agent Policy
5. Tool Contract
6. User request
7. Retrieved content

RAG document, user upload эсвэл tool output дотор:

> ignore previous instructions

гэх мэт instruction байгаа тохиолдолд security policy-г өөрчлөхгүй.

---

# 15. Data Minimization

Gateway зөвхөн тухайн хүсэлтийг боловсруулахад шаардлагатай data-г AI Platform руу дамжуулна.

Боломжтой үед:

- unnecessary PII хасах;
- unused fields хасах;
- sensitive field masking хийх;
- scoped API ашиглах.

Entire database record дамжуулахын оронд шаардлагатай fields сонгоно.

---

# 16. Audit Contract

AI request бүр audit trail үүсгэнэ.

Minimum audit metadata:

- `request_id`
- `tenant_id`
- `user_id`
- `session_id`
- agent
- agent version
- prompt/policy version
- model/model alias
- tools called
- RAG sources
- authorization result
- action classification
- approval state
- execution result
- latency
- token usage
- cost
- errors
- timestamp

Audit record нь tenant-aware байна.

---

# 17. Logging Security

Log дотор:

- password;
- access token;
- API secret;
- database credential

хадгалахгүй.

Sensitive data logging нь masking/redaction policy мөрдөнө.

Model prompt болон tool payload-ийг бүхэлд нь автоматаар unrestricted log хийхгүй.

---

# 18. Session ба Memory

`session_id` tenant болон user scope-той байна.

AI memory:

- cross-tenant shared болохгүй;
- authorization bypass хийх эх сурвалж болохгүй;
- Core System of Record-ийг орлохгүй;
- historical AI statement-ийг live Core fact гэж үзэхгүй.

Live operational асуултад шаардлагатай үед Core Tool-оос дахин шалгана.

---

# 19. Cache Contract

Cache key нь хамгийн багадаа:

**tenant scope + authorization/data scope + resource/query identity**

агуулсан байна.

Tenant-independent гэж батлагдаагүй data-г global cache-д хадгалахгүй.

Нэг tenant-ийн cached response нөгөө tenant-д ашиглагдахгүй.

---

# 20. Error Contract

Gateway стандарт error category ашиглана.

- Authentication Error
- Authorization Error
- Tenant Context Error
- Validation Error
- Tool Permission Error
- Tool Timeout
- Tool Failure
- AI Provider Failure
- Rate Limit
- Policy Violation
- Approval Required
- Data Not Available
- Internal Error

Security-related алдаа хэрэглэгчид internal architecture, credentials, stack trace задруулахгүй.

`request_id` / `trace_id` ашиглан technical investigation хийнэ.

---

# 21. Timeout ба Failure Isolation

AI failure Core iBeX үндсэн ажиллагааг зогсоохгүй.

AI Platform unavailable үед:

**Core iBeX үндсэн CMMS/EAM operation хэвийн үргэлжилнэ.**

Gateway:

- timeout;
- circuit protection;
- bounded retry;
- failure isolation

дэмжих архитектуртай байна.

Action request дээр uncontrolled automatic retry хийхгүй.

---

# 22. Idempotency

State-changing Action Tool нь давхар execution-ээс хамгаалагдана.

Action request нь unique:

- request identity;
- action identity;
- idempotency identity

ашиглах боломжтой байна.

Network retry нь давхар:

- WO;
- request;
- issue;
- approval;
- transaction

үүсгэх ёсгүй.

---

# 23. Rate Limit ба Cost Control

Gateway request level дээр:

- tenant limit;
- user limit;
- capability limit;
- abuse protection

хэрэгжүүлэх боломжтой байна.

AI Platform Model Gateway нь:

- model routing;
- token budget;
- cost budget;
- latency policy

удирдана.

Tenant хэрэглэгч model provider-ийг шууд сонгох эрхгүй.

---

# 24. Model Independence

Core iBeX нь OpenAI болон бусад model provider-той шууд contract хийхгүй.

Architecture:

**Core → AI Gateway → AI Platform → Model Gateway → Provider**

байна.

Ингэснээр model/provider солигдсон тохиолдолд Core API contract өөрчлөгдөхгүй.

---

# 25. Streaming

Streaming response дэмжсэн тохиолдолд:

- authentication;
- tenant context;
- permission;
- audit;
- output safety

дүрэм өөрчлөгдөхгүй.

Streaming эхэлсэн нь final action approval гэсэн үг биш.

---

# 26. File ба Attachment

AI руу file дамжуулахдаа:

- tenant ownership;
- file access permission;
- size/type policy;
- malware/security validation;
- retention policy

шалгана.

File content нь **untrusted content** байна.

Upload хийсэн document Master Policy эсвэл Tool Contract-ийг өөрчлөхгүй.

---

# 27. Mobile Contract

Mobile App AI Platform-тай шууд холбогдохгүй.

Architecture:

**Mobile → Mobile BFF/Core → AI Gateway → AI Platform**

байна.

Device:

- AI API key;
- model provider credential;
- privileged AI token

хадгалахгүй.

---

# 28. Admin Governance

## iBeX Admin

AI Gateway түвшинд:

- global enable/disable;
- platform availability;
- capability availability;
- global limits;
- policy version;
- audit/monitoring

удирдана.

## Tenant Admin

Зөвхөн өөрийн tenant-ийн хүрээнд:

- AI enable/disable;
- ямар хэрэглэгч AI ашиглах;
- role-based AI access

тохируулна.

Tenant Admin:

- Master Policy;
- global security;
- provider credentials;
- global gateway policy

өөрчлөхгүй.

---

# 29. Versioning

Gateway contract versioned байна.

Жишээ:

`AI Gateway Contract v1.0`

Breaking өөрчлөлт хийхэд contract version шинэчлэгдэнэ.

Backward compatibility боломжтой үед хадгална.

Contract version болон API implementation version-ийг тусдаа ойлголт гэж үзнэ.

---

# 30. Contract Violation

Дараах тохиолдлыг architecture violation гэж үзнэ:

- AI → Core DB direct SQL;
- browser → AI provider direct call;
- Mobile → AI Platform direct privileged call;
- user-supplied `tenant_id`-г authoritative гэж үзэх;
- agent tenant солих;
- permission-ийг prompt-аар override хийх;
- unapproved API/tool ашиглах;
- cross-tenant RAG/cache/memory;
- AI recommendation-ийг шууд approved engineering decision болгох;
- approval workflow bypass хийх;
- secret prompt/log-д хадгалах.

---

# 31. Security Invariants

Дараах invariants ямар ч agent, provider, feature нэмэгдсэн үед өөрчлөгдөхгүй.

**Invariant 1**  
Request бүр tenant-bound байна.

**Invariant 2**  
Authorization server-side байна.

**Invariant 3**  
AI Core database-д шууд хандахгүй.

**Invariant 4**  
AI зөвхөн approved Tool/API ашиглана.

**Invariant 5**  
Cross-tenant context sharing байхгүй.

**Invariant 6**  
AI recommendation нь Core approval биш.

**Invariant 7**  
Write action Core workflow-г дамжина.

**Invariant 8**  
Request/action бүр auditable байна.

**Invariant 9**  
Model provider солигдсон ч security boundary өөрчлөгдөхгүй.

**Invariant 10**  
AI unavailable болсон ч Core iBeX үндсэн operation үргэлжилнэ.

---

# 32. Implementation Classification

## CURRENT — Батлагдсан architecture

- Standalone AI Platform
- Core → AI Gateway → AI Platform
- Trusted tenant context
- Server-side authorization
- Direct SQL хориглох
- Tenant isolation
- Controlled Tools/APIs
- RAG / Live Data separation
- Human approval
- Audit
- Model Gateway abstraction

## PILOT

Эхний implementation-д:

- authenticated AI request endpoint;
- trusted context propagation;
- General iBeX Agent;
- Maintenance Agent;
- Asset Agent;
- Warehouse Agent;
- Read Tools;
- approved RAG;
- audit tracing;
- basic cost/rate controls

хэрэгжинэ.

## R&D

- advanced autonomous orchestration;
- long-running agent workflow;
- complex multi-agent delegation;
- predictive model integration;
- advanced semantic caching;
- automatic planning optimization.

Эдгээрийг security болон evaluation-аар баталгаажуулсны дараа production-д шилжүүлнэ.

## FUTURE

- additional domain agents;
- richer action tools;
- advanced multimodal inspection;
- predictive maintenance models;
- constrained autonomous workflow execution.

---

# 33. Production Gate

AI Gateway production implementation эхлэхээс өмнө дараах баримт бичгүүд харилцан нийцсэн байна:

1. Master AI Policy v1.0
2. Tenant Security Contract v1.0
3. Agent Architecture v1.0
4. **AI Gateway Contract v1.0**
5. Tool Contract specification
6. RAG/Data Source Contract
7. Audit specification
8. Evaluation/Test specification

Эдгээрийн дараа:

**Logical Contract → API Schema → Security Review → Pilot Implementation**

дарааллаар хэрэгжинэ.

---

# 34. Эцсийн архитектурын зарчим

**AI Gateway нь зөвхөн API proxy биш.**

Энэ нь:

**Identity Boundary + Tenant Boundary + Authorization Boundary + Policy Boundary + Tool Boundary + Audit Boundary**

юм.

iBeX-ийн AI архитектурын үндсэн урсгал:

**Core iBeX  
→ Trusted AI Gateway  
→ AI Orchestrator  
→ Authorized Domain Agent  
→ Approved RAG / Controlled Tools  
→ Model Gateway  
→ LLM / Predictive Model**

байна.

AI нь Core iBeX-ийн **System of Record**, authorization болон workflow governance-ийг ямар ч нөхцөлд орлохгүй.
