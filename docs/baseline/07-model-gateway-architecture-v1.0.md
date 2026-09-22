# iBeX Hybrid Intelligent AI Platform — Model Gateway Architecture v1.0

**Version:** 1.0  
**Status:** Approved / Architecture Baseline

# iBeX Hybrid Intelligent AI Platform  
## Model Gateway Architecture v1.0

**Status:** Architecture Baseline  
**Scope:** iBeX Hybrid Intelligent AI Platform  
**Version:** 1.0  
**Classification:** Core AI Architecture  
**Implementation status:** Current Architecture / Pilot Implementation Required

---

# 1. Зорилго

**Model Gateway** нь iBeX Hybrid Intelligent AI Platform доторх бүх Generative AI болон LLM model access-ийг төвлөрүүлэн удирдах дотоод gateway layer байна.

Үндсэн зорилго:

- AI agent-уудыг тодорхой нэг LLM provider-оос салгах
- OpenAI, open-source болон ирээдүйн provider/model-уудыг нэг architecture-аар ашиглах
- model selection болон routing-ийг төвлөрүүлэх
- tenant isolation-ийг model invocation түвшинд хамгаалах
- confidential data handling policy мөрдүүлэх
- token, cost, latency хянах
- fallback болон resilience хэрэгжүүлэх
- model/prompt version-ийг audit хийх
- provider солиход agent architecture өөрчлөхгүй байх
- шинэ model нэвтрүүлэхэд controlled evaluation хийх

Model Gateway нь **business workflow engine биш**, **AI agent биш**, **Core iBeX integration gateway биш**.

---

# 2. Architecture дахь байрлал

iBeX-ийн үндсэн урсгал:

**Core iBeX**  
↓  
**AI Gateway**  
↓  
**AI Orchestrator / Domain Agents**  
↓  
**RAG / Tools / Context Builder**  
↓  
**Model Gateway**  
↓  
**AI Model Provider**

Model Provider жишээ:

- OpenAI
- Approved Open-source Model
- Private/Self-hosted Model
- Future Provider

Үндсэн зарчим:

> **Core access → AI Gateway**  
> **Operational data → Controlled Tools/API**  
> **Documents → RAG**  
> **LLM/model access → Model Gateway**

Agent ямар ч тохиолдолд provider API-г шууд дуудахгүй.

---

# 3. AI Gateway ба Model Gateway-ийн ялгаа

| Component | Үндсэн үүрэг |
|---|---|
| **AI Gateway** | Core iBeX ба AI Platform хоорондын trusted boundary |
| **Model Gateway** | AI Platform ба AI Model Provider хоорондын controlled boundary |

### AI Gateway

AI Gateway дараах зүйлсийг хариуцна:

- authentication context
- tenant context
- user identity
- permissions
- entitlement
- request validation
- Core ↔ AI communication
- API/tool boundary

### Model Gateway

Model Gateway дараах зүйлсийг хариуцна:

- model capability selection
- provider routing
- model invocation
- fallback
- token/cost control
- confidentiality policy
- model availability
- latency tracking
- model version tracking
- provider error normalization

Model Gateway нь Core iBeX-ийн authorization-ийг орлохгүй.

---

# 4. Үндсэн архитектурын зарчим

## 4.1 Provider Independence

Domain Agent:

> “OpenAI model X ашигла”

гэж hard-code хийхгүй.

Agent нь хэрэгцээтэй capability-г тодорхойлно.

Жишээ:

- general_generation
- fast_response
- structured_reasoning
- document_analysis
- multimodal_analysis
- long_context
- tool_reasoning

Model Gateway тухайн capability-д тохирох approved model-ийг сонгоно.

Ингэснээр:

**Agent → Capability**

байхаас:

**Agent → Specific Provider Model**

болохгүй.

---

# 5. Model Gateway logical architecture

```text id="qkcj7k"
                    AI ORCHESTRATOR
                          │
                 DOMAIN AGENT
                          │
                 Context Builder
                  /      |      \
                RAG    Tools   Policy
                  \      |      /
                          │
                 MODEL GATEWAY
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Policy Engine     Model Router     Usage Control
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                  Provider Adapters
             ┌────────────┼────────────┐
             │            │            │
          OpenAI      Open-source     Future
          Adapter       Adapter       Adapter
             │            │            │
           Model        Model        Model
```

---

# 6. Model Gateway үндсэн бүрэлдэхүүн

## 6.1 Gateway API

Agent болон internal AI service-ээс ирэх model request-ийг хүлээн авна.

Gateway API нь provider-specific API format-аас тусдаа байна.

Agent зөвхөн iBeX internal Model Gateway Contract ашиглана.

---

## 6.2 Policy Engine

Model invocation бүрийг policy-тэй тулган шалгана.

Үүнд:

- tenant context
- confidentiality classification
- allowed capability
- approved provider
- approved model
- cost policy
- model availability
- data handling policy
- maximum context
- output restrictions

орно.

---

## 6.3 Model Router

Model Router нь тухайн request-д ашиглах model/provider-ийг сонгоно.

Routing decision дараах хүчин зүйлд тулгуурлаж болно:

1. task capability
2. reasoning requirement
3. latency requirement
4. confidentiality
5. context size
6. multimodal requirement
7. tool-use capability
8. model availability
9. cost
10. provider health
11. platform policy
12. tenant entitlement

Model Router tenant-ийг өөрөө сонгохгүй.

`tenant_id` нь trusted upstream context-оос ирнэ.

---

# 7. Capability Profile

Model Gateway нь model name биш **capability profile**-оор ажиллахыг үндсэн зарчим болгоно.

Анхны profile:

### MG-FAST

Зориулалт:

- classification
- extraction
- short answers
- routing assistance
- simple summarization
- lightweight transformation

Priority:

**Low latency + Low cost**

---

### MG-GENERAL

Зориулалт:

- General iBeX Agent
- common Q&A
- RAG grounded response
- maintenance explanation
- asset information interpretation

Priority:

**Quality + Cost + Latency balance**

---

### MG-REASONING

Зориулалт:

- complex engineering reasoning
- multi-source reasoning
- complex maintenance analysis
- planning support
- difficult technical analysis

Priority:

**Reasoning quality**

High reasoning model-ийг бүх request-д default ашиглахгүй.

---

### MG-LONG-CONTEXT

Зориулалт:

- large technical document
- multi-document synthesis
- extensive standards/manual analysis

---

### MG-MULTIMODAL

Зориулалт:

- image analysis
- equipment photo interpretation
- diagram/document visual understanding

Operational engineering decision автоматаар гаргахгүй.

---

### MG-EMBEDDING

RAG embedding зориулалттай.

Generation model-оос тусдаа capability.

---

### MG-RERANK

Retrieval result ranking шаардлагатай үед ашиглана.

Энэ capability нь Pilot/R&D implementation-аас хамаарч идэвхжиж болно.

---

# 8. Model Registry

Model Gateway нь төвлөрсөн **Model Registry** ашиглана.

Model бүр дараах metadata-тай байна:

- provider_id
- model_id
- model_version
- capability
- context_limit
- input type
- output type
- structured output capability
- tool-use capability
- multimodal capability
- latency class
- cost class
- confidentiality class
- deployment type
- enabled/disabled
- evaluation status
- approved environments

Model Registry дахь model бүр:

**Unapproved → Evaluation → Approved → Deprecated → Disabled**

lifecycle-тай байна.

---

# 9. Provider Adapter Layer

Provider бүр тусдаа adapter ашиглана.

Жишээ:

```text id="p7q7v8"
Model Gateway
     │
     ├── OpenAI Adapter
     ├── Open-source Adapter
     ├── Private Model Adapter
     └── Future Provider Adapter
```

Adapter дараах ялгааг normalize хийнэ:

- request format
- response format
- token usage
- errors
- timeout
- streaming
- structured output
- tool calling
- provider-specific metadata

Ингэснээр Domain Agent provider API-г мэдэх шаардлагагүй.

---

# 10. Trusted Model Request Context

Model Gateway request бүр trusted context агуулна:

- request_id
- tenant_id
- user_id
- session_id
- agent_id
- role
- permissions
- entitlements
- capability
- confidentiality_class
- prompt_version
- policy_version
- context metadata

Model Gateway:

- tenant үүсгэхгүй
- tenant таахгүй
- tenant солихгүй
- хэрэглэгчийн текстээс tenant_id авахгүй

Tenant context зөвхөн trusted AI Platform context-оос дамжина.

---

# 11. Tenant Isolation

Model Gateway дээр multi-tenant isolation заавал мөрдөнө.

Tenant A-ийн:

- prompt
- context
- RAG data
- tool output
- cached response
- conversation history

нь Tenant B-ийн model invocation-д ашиглагдахгүй.

Ялангуяа:

> Cross-tenant shared prompt context хориглоно.

Shared байж болох зүйл:

- Master AI Policy
- approved global instructions
- public reference knowledge
- platform configuration

Tenant operational data shared context болохгүй.

---

# 12. Prompt Assembly Boundary

Final model context дараах логик давхаргатай байна.

```text id="pywk59"
Master AI Policy
       ↓
Orchestrator Policy
       ↓
Domain Agent Prompt
       ↓
Trusted User Context
       ↓
RAG Context
       ↓
Tool Results
       ↓
User Request
```

Priority:

**Master Policy > Platform Policy > Domain Policy > Trusted Context > Retrieved Content > User Content**

RAG document болон tool output нь instruction hierarchy-г override хийх боломжгүй.

---

# 13. Prompt Injection Defense

Model Gateway нь prompt injection хамгаалалтын нэг давхарга байна.

Гэхдээ Model Gateway дангаараа хамгаалалтыг бүрэн хариуцахгүй.

Defense-in-depth:

```text id="3h405a"
AI Gateway
   ↓
Orchestrator
   ↓
RAG Security
   ↓
Tool Security
   ↓
Model Gateway Policy
   ↓
LLM
```

Retrieved document дахь:

> “previous instruction-ийг ignore хий”

гэх мэт content нь trusted instruction биш.

Model Gateway ийм content-ийг authority болгон авч үзэхгүй.

---

# 14. Confidentiality Classification

Request бүр confidentiality classification-тай байж болно.

Жишээ:

- PUBLIC
- INTERNAL
- TENANT_CONFIDENTIAL
- RESTRICTED

Provider routing нь classification-аас хамаарна.

Жишээ архитектурын дүрэм:

**RESTRICTED → зөвхөн approved deployment/provider**

Model Gateway confidential data-г зөвшөөрөгдөөгүй provider руу илгээхгүй.

---

# 15. Data Minimization

Provider руу зөвхөн task гүйцэтгэхэд шаардлагатай context дамжуулна.

Хориглох:

- шаардлагагүй бүх tenant profile
- бүх database record
- бүх conversation history
- unrelated documents
- unnecessary personal data
- secret/API key

Зарчим:

> **Minimum necessary context**

---

# 16. Training and Retention Policy

Tenant data-г model training-д автоматаар ашиглахгүй.

Model Gateway provider configuration нь боломжтой бол:

- training disabled
- minimum retention
- enterprise privacy control
- approved data handling

бодлогыг ашиглана.

Provider-ийн data handling нөхцөл architecture approval шаардлагатай.

---

# 17. Model Routing

Default routing sequence:

```text id="qypkss"
Agent Request
      ↓
Capability Detection
      ↓
Policy Validation
      ↓
Confidentiality Check
      ↓
Candidate Models
      ↓
Entitlement Check
      ↓
Cost / Latency / Availability
      ↓
Selected Model
      ↓
Provider Adapter
```

Routing нь deterministic policy + configurable rules ашиглана.

LLM өөрөө дур мэдэн provider/model сонгохгүй.

---

# 18. Model Selection Authority

### AI Orchestrator / Agent

Capability requirement тодорхойлж болно.

### Model Gateway

Actual model сонгоно.

### iBeX Admin

- provider configuration
- model enable/disable
- routing policy
- limits
- approved models

удирдана.

### Tenant Admin

Model provider сонгохгүй.

Tenant Admin зөвхөн батлагдсан governance-ийн дагуу:

- AI enable/disable
- user AI access

хянах үндсэн эрхтэй байна.

---

# 19. Fallback Architecture

Primary model алдаа гарвал controlled fallback ажиллаж болно.

```text id="uff619"
Primary Model
     ↓ failure
Fallback Model
     ↓ failure
Controlled Error Response
```

Fallback model:

- ижил эсвэл зөвшөөрөгдсөн capability
- ижил confidentiality requirement
- approved provider
- compatible security classification

хангасан байна.

Security policy зөрчих model руу fallback хийхгүй.

---

# 20. Fallback хийхгүй нөхцөл

Дараах тохиолдолд өөр model руу автоматаар шилжихгүй байж болно:

- confidentiality restriction
- unsupported data residency
- incompatible model capability
- explicit compliance restriction
- tenant isolation uncertainty
- authorization validation failure

Энэ үед **fail closed** зарчим ашиглана.

---

# 21. Retry Policy

Provider transient error үед controlled retry ашиглаж болно.

Гэхдээ:

- endless retry хийхгүй
- write/action tool автоматаар дахин ажиллуулахгүй
- duplicate execution үүсгэхгүй
- retry audit log-д бүртгэнэ

Model retry нь Tool/API action retry-гаас тусдаа байна.

---

# 22. Timeout

Model invocation бүр timeout policy-тэй байна.

Profile бүр өөр timeout threshold ашиглаж болно.

Timeout гарсан тохиолдолд:

1. retry policy шалгана
2. fallback боломж шалгана
3. controlled error буцаана
4. audit event үүсгэнэ

---

# 23. Circuit Breaker

Provider failure rate өсөхөд Model Gateway provider-ийг түр:

**Healthy → Degraded → Unavailable**

төлөвт шилжүүлж болно.

Unavailable provider руу шинэ request route хийхгүй.

Health сэргэсэн үед controlled recovery хийнэ.

---

# 24. Cost Control

Model Gateway бүх model usage-ийг хэмжинэ.

Үүнд:

- input tokens
- output tokens
- total tokens
- model
- provider
- estimated cost
- tenant
- agent
- request_id

орно.

Cost limit дараах түвшинд байж болно:

- platform
- provider
- model
- tenant entitlement
- agent
- environment

Hard limit давах үед controlled denial ашиглана.

---

# 25. Cost Optimization

Model Gateway-ийн зарчим:

> **Cheapest model биш — шаардлагыг хангах хамгийн зохистой model.**

Жишээ:

simple classification → MG-FAST

standard RAG Q&A → MG-GENERAL

complex engineering reasoning → MG-REASONING

large document → MG-LONG-CONTEXT

Ингэснээр бүх request-ийг өндөр өртөгтэй reasoning model руу явуулахгүй.

---

# 26. Context Budget

Context Builder болон Model Gateway token budget удирдана.

Token priority:

1. Master Policy
2. Security/authorization context
3. Domain instruction
4. relevant RAG evidence
5. relevant tool result
6. conversation context
7. optional background context

Context limit хүрвэл security instruction хэзээ ч truncate хийхгүй.

---

# 27. Output Control

Model response Provider Adapter-аас шууд хэрэглэгчид очихгүй.

Урсгал:

```text id="u9u7w5"
Provider
   ↓
Model Gateway
   ↓
Output Validation
   ↓
Agent / Orchestrator
   ↓
AI Gateway
   ↓
Core/User
```

Output validation-д:

- schema validation
- malformed output
- forbidden data
- tool-call structure
- citation structure
- safety/policy flags

шалгаж болно.

---

# 28. Structured Output

Agent workflow шаардлагатай үед model output нь versioned schema-тай байна.

Жишээ:

- classification result
- maintenance recommendation
- tool intent
- RAG grounded answer
- extraction result

Natural language output-ийг operational action болгон шууд ашиглахгүй.

---

# 29. Tool Calling Boundary

Model Gateway нь tool execution engine биш.

LLM tool хэрэглэх санал/structured call үүсгэж болно.

Гэхдээ:

```text id="7m79ld"
LLM
 ↓
Model Gateway
 ↓
Agent / Orchestrator
 ↓
Authorization Check
 ↓
Tool Gateway / Tool Contract
 ↓
Tool
```

LLM provider Core API-г шууд дуудахгүй.

---

# 30. Read Tool ба Action Tool

Model Gateway tool classification хийхгүй.

Энэ нь Tool/API Contract-ийн responsibility.

Model Gateway-аас үүссэн tool request нь Agent/Orchestrator руу буцна.

Action tool execution:

- authorization
- tenant validation
- permission
- approval
- workflow

дамжсаны дараа хэрэгжинэ.

---

# 31. Human-in-the-Loop

Model Gateway-аас ирсэн response:

**AI output**

болохоос:

**approved engineering decision**

биш.

Inspection, maintenance, PM, PdM, WO зэрэг operational decision нь Core iBeX workflow-р баталгаажина.

---

# 32. Predictive AI Boundary

Predictive AI model нь Generative AI LLM-ээс архитектурын хувьд тусдаа capability байна.

```text id="aav37g"
Predictive Model Service
        │
        ├── Failure prediction
        ├── Anomaly detection
        └── Forecasting
```

Model Gateway v1.0 нь үндсэндээ:

- LLM
- Generative AI
- embedding
- reranking
- multimodal AI

model access-ийг хариуцна.

Predictive model lifecycle, feature store, training, validation нь тусдаа **Predictive AI Architecture**-т тодорхойлогдоно.

LLM нь predictive result-ийг тайлбарлаж болох боловч prediction-г зохиохгүй.

---

# 33. Audit Trail

Model invocation бүр audit metadata үүсгэнэ.

Заавал хадгалах:

- request_id
- tenant_id
- user_id
- agent_id
- provider
- model
- model version
- capability profile
- prompt version
- policy version
- token usage
- estimated cost
- latency
- fallback status
- error code
- timestamp

Шаардлагатай тохиолдолд:

- RAG source references
- tool references
- approval state

request audit chain-тай холбоно.

---

# 34. Sensitive Logging

Audit хийх нэрээр full prompt болон confidential content-ийг indiscriminate байдлаар log хийхгүй.

Logging policy:

- metadata first
- sensitive data minimization
- redaction
- access control
- retention policy

ашиглана.

Auditability болон confidentiality-ийн тэнцвэрийг хадгална.

---

# 35. Observability

Model Gateway дараах metric-тэй байна:

- requests/minute
- success rate
- error rate
- latency
- token usage
- cost
- model distribution
- provider availability
- fallback rate
- timeout rate
- throttling
- policy rejection

Monitoring tenant-aware байна.

---

# 36. Error Normalization

Provider бүрийн өөр error format-ийг internal standard error болгон хөрвүүлнэ.

Жишээ ангилал:

- MODEL_UNAVAILABLE
- PROVIDER_TIMEOUT
- RATE_LIMITED
- POLICY_DENIED
- CONTEXT_TOO_LARGE
- MODEL_NOT_ALLOWED
- BUDGET_EXCEEDED
- INVALID_RESPONSE
- PROVIDER_ERROR
- GATEWAY_ERROR

Agent provider-specific error code дээр dependency үүсгэхгүй.

---

# 37. Rate Limiting

Rate limit дараах түвшинд хэрэгжинэ:

- global platform
- provider
- model
- tenant
- user
- agent

Rate limit tenant хооронд service starvation үүсэхээс хамгаална.

---

# 38. Model Versioning

Production model reference versioned байна.

Model alias:

**MG-GENERAL**

Actual mapping:

```text id="49tfi2"
MG-GENERAL
      ↓
Approved Provider Model Version
```

Actual mapping өөрчлөгдөж болно.

Agent architecture өөрчлөгдөхгүй.

Model upgrade бүр evaluation gate дамжина.

---

# 39. Prompt Versioning

Model version болон prompt version тусдаа байна.

Audit record:

```text id="88nhim"
agent_version
prompt_version
policy_version
model_version
```

гэж тусдаа хадгална.

Ингэснээр response quality өөрчлөгдөхөд шалтгааныг trace хийх боломжтой.

---

# 40. Evaluation Gate

Шинэ model production-д шууд орохгүй.

Lifecycle:

```text id="zuwwne"
Candidate
   ↓
Offline Evaluation
   ↓
Security Evaluation
   ↓
Domain Evaluation
   ↓
Cost / Latency Evaluation
   ↓
Pilot / Shadow
   ↓
Approval
   ↓
Production
```

Evaluation-д:

- accuracy
- hallucination
- grounding
- tool-use correctness
- structured output reliability
- Mongolian capability
- domain terminology
- tenant isolation
- security
- cost
- latency

багтана.

---

# 41. Shadow Evaluation

Шинэ model-ийг production user response болгон шууд ашиглахгүйгээр shadow горимоор шалгаж болно.

```text id="qbgzqh"
Production Request
      │
      ├── Current Approved Model → User
      │
      └── Candidate Model → Evaluation Only
```

Candidate result хэрэглэгчид харагдахгүй.

Tenant data ашигласан shadow evaluation нь мөн tenant isolation болон confidentiality policy мөрдөнө.

---

# 42. Caching

Model response caching default байдлаар болгоомжтой ашиглана.

Cache ашиглавал key-д дор хаяж:

- tenant_id
- capability
- model version
- prompt version
- input fingerprint

оролцоно.

Cross-tenant response cache хориглоно.

Sensitive operational response-ийг cache хийх эсэхийг policy тодорхойлно.

---

# 43. Conversation Context

Conversation memory нь Model Gateway-ийн global memory биш.

Conversation context:

- tenant scoped
- user/session scoped
- authorized
- minimal
- retention controlled

байна.

Model Gateway нэг tenant-ийн previous conversation-ийг өөр tenant-д дахин ашиглахгүй.

---

# 44. Model Gateway Security Boundary

Model Gateway дээр:

- provider credentials
- API keys
- private endpoints
- model configuration

server-side байна.

API key:

- client руу дамжуулахгүй
- agent prompt-д оруулахгүй
- log-д бичихгүй
- source code-д hard-code хийхгүй

Secret Manager ашиглана.

---

# 45. Network Security

Production Model Gateway:

- encrypted communication
- outbound allowlist
- provider endpoint validation
- private networking боломжтой бол ашиглах
- TLS
- firewall policy

ашиглана.

Unknown provider endpoint руу model request илгээхгүй.

---

# 46. Provider Configuration

Provider configuration нь төвлөрсөн байна.

Тохиргоонд:

- provider
- endpoint
- credential reference
- available models
- capability
- cost metadata
- limits
- confidentiality eligibility
- active status
- fallback priority

орно.

Эдгээрийг Tenant Admin өөрчлөхгүй.

---

# 47. Model Gateway Admin Governance

## iBeX Admin

Дараах эрхтэй:

- provider enable/disable
- model enable/disable
- model registry
- capability mapping
- routing policy
- fallback policy
- cost limits
- evaluation status
- model rollout
- model deprecation
- monitoring

## Tenant Admin

Model Gateway configuration-д шууд access байхгүй.

Tenant Admin:

- AI ашиглах эсэх
- өөрийн tenant-ийн AI user access

хянах үндсэн scope-тэй байна.

---

# 48. Configuration Separation

Configuration дараах байдлаар сална.

```text id="dpmgu4"
Global Model Policy
        │
        ├── Provider Config
        ├── Model Registry
        ├── Routing
        ├── Cost Policy
        └── Security Policy

Tenant Entitlement
        │
        └── Allowed AI Capability
```

Tenant configuration global security policy-г override хийж болохгүй.

---

# 49. Environment Separation

Доод тал нь:

- Development
- Test
- Staging
- Production

environment тусгаарлана.

Production credential non-production орчинд ашиглахгүй.

Model configuration environment-specific байж болно.

---

# 50. Degraded Mode

External provider unavailable үед platform бүрэн унтрах шаардлагагүй.

Боломжтой бол:

- RAG retrieval
- deterministic rules
- normal Core features
- predefined responses

үргэлжилж болно.

Гэхдээ LLM шаардлагатай capability-г fake output-аар орлуулахгүй.

---

# 51. Fail-Safe Principle

Model Gateway эргэлзээтэй үед:

> **Fail closed rather than leak data.**

Ялангуяа:

- tenant uncertainty
- authorization uncertainty
- confidentiality mismatch
- provider policy mismatch

үед request илгээхгүй.

---

# 52. Hallucination Handling

Model Gateway hallucination-г бүрэн арилгах боломжгүй.

Тиймээс architecture нь:

- RAG grounding
- authoritative tools
- source references
- structured output
- confidence/limitation
- human review

давхаргуудыг ашиглана.

Model-ийн өөрийн “би итгэлтэй байна” гэсэн текстийг engineering confidence гэж үзэхгүй.

---

# 53. Grounding Priority

Operational factual answer:

**Controlled Tool/API > Approved RAG Source > Model prior knowledge**

зарчмыг баримтална.

Live operational data-г LLM-ийн pre-trained knowledge-оос авахгүй.

---

# 54. Model Knowledge Boundary

LLM өөрийн training knowledge дээр тулгуурлан:

- asset status
- WO status
- warehouse stock
- current budget
- current inspection
- current contract
- current project status

зохиож болохгүй.

Эдгээрийг Controlled Tool/API-аас авна.

---

# 55. Streaming

Streaming response ашиглаж болно.

Гэхдээ:

- partial response нь authorization bypass хийхгүй
- unsafe structured action incomplete үед execute хийхгүй
- audit metadata бүрэн хадгална

Streaming нь presentation capability болохоос authorization mechanism биш.

---

# 56. Idempotency

Model invocation нь ерөнхийдөө read/generation operation.

Гэхдээ model output-аас үүсэх tool/action workflow нь `request_id` болон шаардлагатай үед `idempotency_key` ашиглана.

Model retry нь Core action duplicate execution үүсгэх ёсгүй.

---

# 57. Model Gateway Contract — Request

Conceptual request нь:

- request_id
- tenant_context
- agent_id
- capability
- prompt_context
- retrieval_context
- tool_context
- confidentiality
- response_schema
- generation constraints
- timeout policy

агуулна.

Provider-specific parameter agent contract-д оруулахгүй.

---

# 58. Model Gateway Contract — Response

Conceptual response:

- request_id
- result
- structured_output
- model_id
- model_version
- provider
- usage
- latency
- finish_reason
- fallback_used
- policy_flags
- error

агуулна.

Domain Agent response-аас provider metadata-г хэрэглэгчид заавал харуулах шаардлагагүй.

Audit trail-д хадгална.

---

# 59. Prohibited Architecture

Дараах бүтэц хориглоно:

### Хориг 1

**Agent → OpenAI API directly**

### Хориг 2

**Mobile App → LLM provider**

### Хориг 3

**Core frontend → Model API**

### Хориг 4

Prompt дотроос provider API key ашиглах.

### Хориг 5

Tenant content-ийг cross-tenant cache болгох.

### Хориг 6

Unapproved model production-д ашиглах.

### Хориг 7

Provider outage үед security requirement сулруулах.

### Хориг 8

High-cost/high-reasoning model-ийг бүх request-д default ашиглах.

### Хориг 9

LLM response-ийг Core write operation болгон шууд execute хийх.

---

# 60. Current / Pilot / R&D / Future

## Current — Architecture Baseline

Батлагдсан үндсэн зарчим:

- standalone AI Platform
- centralized Model Gateway
- provider-independent architecture
- no direct agent-to-provider access
- tenant-aware invocation
- centralized model registry
- capability-based routing
- audit
- cost tracking
- security policy
- fallback framework

---

## Pilot

Эхний implementation:

- OpenAI provider adapter
- core Model Gateway API
- MG-FAST
- MG-GENERAL
- MG-REASONING
- embedding capability
- usage metering
- audit
- cost control
- primary/fallback routing
- provider health monitoring

Pilot Agent priority:

1. General iBeX Agent
2. Maintenance Agent
3. Asset Agent
4. Warehouse Agent

---

## R&D

Туршилт шаардлагатай:

- self-hosted/open-source LLM
- advanced reranking
- semantic model router
- model ensembles
- intelligent context compression
- specialized maintenance model
- domain fine-tuning

R&D capability production default биш.

---

## Future

- additional providers
- private model deployment
- regional model routing
- confidential/private inference
- advanced multimodal models
- automatic model benchmarking
- dynamic cost optimization
- domain-specific models

---

# 61. Implementation Order

Model Gateway хэрэгжилтийн дараалал:

### Phase 1 — Contract

- internal request/response schema
- capability profiles
- error schema
- audit schema

### Phase 2 — Registry

- provider registry
- model registry
- capability mapping
- model status

### Phase 3 — Security

- secret management
- tenant propagation
- confidentiality policy
- provider allowlist

### Phase 4 — Provider Adapter

Эхний approved provider adapter.

### Phase 5 — Routing

- capability routing
- fallback
- timeout
- retry

### Phase 6 — Governance

- cost limit
- usage monitoring
- admin configuration
- model enable/disable

### Phase 7 — Evaluation

- quality test
- security test
- tenant isolation test
- cost/latency test

### Phase 8 — Pilot Integration

General iBeX Agent-аас эхэлнэ.

---

# 62. Acceptance Criteria

Model Gateway v1 production implementation дараах шалгуурыг хангана.

1. Agent provider API-г шууд дуудахгүй.
2. Бүх model invocation Model Gateway-аар дамжина.
3. Request бүр trusted tenant context-тэй.
4. Cross-tenant context reuse байхгүй.
5. Provider credential client-side байхгүй.
6. Model Registry ажиллана.
7. Capability routing ажиллана.
8. Model/provider version audit-д бүртгэгдэнэ.
9. Token болон cost хэмжигдэнэ.
10. Timeout болон fallback controlled байна.
11. Unapproved provider/model ашиглах боломжгүй.
12. Confidentiality policy routing-д нөлөөлнө.
13. Provider error normalized байна.
14. Model upgrade evaluation gate-тэй.
15. Tool/action authorization Model Gateway-аар bypass хийхгүй.

---

# 63. Architecture Decision Summary

**Decision 1**  
Model access-ийг төвлөрсөн **Model Gateway**-аар дамжуулна.

**Decision 2**  
Agent provider-specific model-той шууд холбогдохгүй.

**Decision 3**  
Agent model name-аас илүү capability profile хүснэ.

**Decision 4**  
Actual provider/model selection-ийг Model Gateway хийнэ.

**Decision 5**  
Tenant context trusted upstream-аас ирнэ.

**Decision 6**  
Cross-tenant context, cache, memory ашиглахгүй.

**Decision 7**  
Provider/model configuration-ийг iBeX Admin удирдана.

**Decision 8**  
Tenant Admin model/provider configuration өөрчлөхгүй.

**Decision 9**  
Fallback security болон confidentiality policy-г сулруулахгүй.

**Decision 10**  
LLM operational tool/API-г шууд execute хийхгүй.

**Decision 11**  
Predictive AI нь Generative AI Model Gateway-аас architecture-ийн хувьд тусдаа capability байна.

**Decision 12**  
Model change нь Agent Architecture дахин бичих шалтгаан болохгүй.

---

# 64. Final Architecture

```text id="aowngx"
                       CORE iBeX
                           │
                      AI Gateway
                           │
                    AI Orchestrator
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Domain Agent           RAG          Controlled Tools
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    Context Builder
                           │
                     Model Gateway
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 Policy Engine        Model Router       Usage/Audit
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                   Provider Adapters
               ┌───────────┼───────────┐
               │           │           │
            OpenAI     Open-source    Future
               │           │           │
             Model       Model       Model
```

---

# 65. Үндсэн зарчим

> **Agents request capabilities.**  
> **Model Gateway selects approved models.**  
> **Providers never control iBeX authorization.**

> **Tenant context remains isolated.**

> **Model output is intelligence, not authority.**

> **Operational authority remains in Core iBeX.**

---

## Architecture Baseline

Ингэснээр iBeX Hybrid Intelligent AI Platform-ийн model layer нь:

**Provider-independent**  
**Tenant-aware**  
**Policy-controlled**  
**Cost-controlled**  
**Auditable**  
**Resilient**  
**Extensible**

архитектуртай болно.

**Master AI Policy → Tenant Security Contract → Agent Architecture → AI Gateway Contract → Tool/API Contract → RAG Architecture → Model Gateway Architecture**

гэсэн үндсэн архитектурын дараалал бүрдэнэ.
