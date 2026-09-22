# iBeX Hybrid Intelligent AI Platform — RAG Architecture v1.0

**Version:** 1.0  
**Status:** Approved / Architecture Baseline

# iBeX Hybrid Intelligent AI Platform
## RAG Architecture v1.0

**Status:** Architecture Baseline  
**Scope:** iBeX Hybrid Intelligent AI Platform  
**Version:** 1.0

---

## 1. Зорилго

RAG Architecture нь iBeX AI Platform-д баталгаатай баримт бичиг, стандарт, заавар, техникийн мэдлэгийг LLM/Agent-д **tenant-aware, permission-aware, traceable, auditable** байдлаар ашиглуулах архитектурыг тодорхойлно.

Үндсэн зарчим:

> **Documents → RAG**  
> **Live operational data → Controlled Tools/APIs**

RAG нь Core iBeX operational database-ийн орлуулга биш.

---

# 2. Architecture Principle

```text
User / Core iBeX
      │
      ▼
AI Gateway
      │
      ▼
AI Orchestrator
      │
      ├── Identity / Tenant / Permission Context
      │
      ├── Domain Agent Selection
      │
      └── Knowledge Requirement
              │
              ▼
        RAG Retrieval Layer
              │
     ┌────────┼─────────┐
     ▼        ▼         ▼
 Public KB  Tenant KB  Domain KB
     │        │         │
     └────────┼─────────┘
              ▼
       Retrieval Results
              │
       Security Filtering
              │
       Relevance / Ranking
              │
              ▼
          Domain Agent
              │
              ▼
         Model Gateway
              │
              ▼
           Response
```

RAG нь Agent-д зөвхөн **retrieved context** өгнө.

RAG өөрөө operational action хийх эрхгүй.

---

# 3. RAG-д орох мэдээлэл

## 3.1 Approved Knowledge Sources

RAG knowledge base-д дараах төрлийн мэдээлэл оруулж болно:

- iBeX Handbook
- User manuals
- Administrator manuals
- Maintenance procedures
- Inspection procedures
- Equipment manuals
- Manufacturer documentation
- Engineering standards
- Safety procedures
- HSE documents
- Approved internal procedures
- Technical instructions
- Training documents
- Approved troubleshooting knowledge
- Approved company knowledge
- Tenant-specific approved documents

---

# 4. RAG-д оруулахгүй мэдээлэл

Дараах мэдээллийг үндсэн RAG knowledge base болгон ашиглахгүй:

- Work Order live records
- Asset current status
- Inventory current balance
- Budget current balance
- Inspection live transaction
- PM/PdM runtime state
- Sensor live data
- PLC/SCADA live values
- Datahub streaming data
- Contract current transaction data
- Project live execution state
- user password
- secret
- API key
- access token
- unrestricted database dump

Эдгээр мэдээллийг шаардлагатай үед **Controlled Tool/API** ашиглан авна.

---

# 5. Knowledge Classification

Knowledge source бүр дараах ангилалтай байна.

### A. Global Approved Knowledge

iBeX бүх tenant-д ашиглаж болох албан ёсны мэдлэг.

Жишээ:

- iBeX Handbook
- iBeX standard user documentation
- public technical documentation

### B. Domain Knowledge

Тодорхой Agent/domain-д зориулсан мэдлэг.

Жишээ:

```text
Maintenance Agent
→ Maintenance manuals

Inspection Agent
→ Inspection procedures

HSE Agent
→ Safety standards

Warehouse Agent
→ Inventory procedures
```

### C. Tenant Private Knowledge

Зөвхөн тухайн tenant ашиглах мэдээлэл.

Жишээ:

- internal SOP
- site procedures
- plant manuals
- tenant-specific equipment manuals
- internal maintenance instructions

Tenant private knowledge-ийг өөр tenant ашиглах боломжгүй.

---

# 6. Tenant Isolation

RAG retrieval бүр trusted context ашиглана:

```text
tenant_id
user_id
role
permissions
entitlements
session_id
request_id
```

Tenant context:

- AI Gateway/Core-оос ирнэ
- Agent өөрөө үүсгэхгүй
- Agent өөрөө солихгүй
- хэрэглэгчийн prompt-оос итгэж авахгүй

Retrieval query нь дор хаяж:

```text
tenant_scope
knowledge_scope
permission_scope
agent_scope
```

-аар хязгаарлагдана.

---

# 7. Tenant Data Isolation Model

Preferred logical model:

```text
Knowledge Platform
│
├── Global Knowledge
│
├── Domain Knowledge
│
└── Tenant Knowledge
       │
       ├── Tenant A
       ├── Tenant B
       └── Tenant C
```

Tenant A document:

```text
Tenant A Agent
        ↓
Tenant A retrieval scope
        ↓
Tenant A knowledge only
```

Tenant A-ийн:

- vector
- embedding
- metadata
- chunk
- retrieval result
- cache

Tenant B-д ашиглагдахгүй.

---

# 8. Knowledge Object

RAG-д орсон document бүр **Knowledge Object** байна.

Minimum metadata:

```text
document_id
document_version
title
source_type
source_owner
tenant_id
domain
classification
approval_status
effective_date
expiry_date
language
source_uri
checksum
created_at
updated_at
```

Нэмэлт:

```text
equipment_type
manufacturer
model
site
department
standard_number
document_category
security_level
```

---

# 9. Approval State

Knowledge source бүр status-тай байна.

```text
Draft
Review
Approved
Deprecated
Archived
Rejected
```

Production RAG retrieval:

> **Approved** status-тай source-оос үндсэндээ мэдээлэл авна.

Deprecated болон Archived document default retrieval-д ашиглагдахгүй.

---

# 10. Document Ingestion Pipeline

```text
Document
   ↓
Upload / Connector
   ↓
File Validation
   ↓
Security Scan
   ↓
Metadata Assignment
   ↓
Tenant Classification
   ↓
Document Parsing
   ↓
Chunking
   ↓
Embedding
   ↓
Indexing
   ↓
Validation
   ↓
Approval
   ↓
Production Knowledge Store
```

Ingestion болон Retrieval-ийг тусдаа lifecycle болгон удирдана.

---

# 11. Document Validation

Knowledge ingestion хийхээс өмнө:

- file type validation
- file size validation
- malware/security scan
- tenant ownership verification
- classification check
- metadata validation
- duplicate detection
- version detection
- approval verification

хийх шаардлагатай.

---

# 12. Chunking Architecture

Document-ийг тогтмол хэмжээтэй механикаар таслах нь үндсэн арга байхгүй.

Structure-aware chunking ашиглана.

Жишээ:

```text
Document
 ├── Chapter
 │    ├── Section
 │    │    ├── Procedure
 │    │    └── Warning
 │    └── Table
 └── Appendix
```

Chunk бүр parent document metadata-г өвлөн авна.

Minimum chunk metadata:

```text
chunk_id
document_id
document_version
tenant_id
domain
section
page/reference
language
classification
```

---

# 13. Embedding Architecture

Embedding layer нь Model Gateway-ийн архитектуртай нийцнэ.

```text
RAG Service
    ↓
Embedding Interface
    ↓
Embedding Provider
```

Provider-ийг architecture-д hard-code хийхгүй.

Ингэснээр:

- OpenAI
- open-source embedding model
- future provider

солих боломжтой байна.

---

# 14. Vector Store

Vector store нь:

- tenant-aware
- metadata-filter capable
- namespace/filter isolation capable
- scalable
- versionable
- auditable

байх шаардлагатай.

Logical retrieval:

```text
Vector Search
+
Tenant Filter
+
Domain Filter
+
Permission Filter
+
Document Status Filter
+
Version Filter
```

Зөвхөн similarity search ашиглахгүй.

---

# 15. Hybrid Retrieval

Pilot architecture нь дараах retrieval хослолыг дэмжихээр төлөвлөгдөнө:

```text
Semantic Search
      +
Keyword Search
      +
Metadata Filtering
      ↓
Candidate Results
      ↓
Ranking
```

Үүнийг **Hybrid Retrieval** гэж үзнэ.

Техникийн identifier, equipment code, document number зэрэгт keyword retrieval онцгой ач холбогдолтой.

---

# 16. Retrieval Flow

Agent RAG шаардлагатай гэж үзвэл:

```text
1. Intent identified
2. Domain identified
3. Tenant context validated
4. User permission checked
5. RAG scope generated
6. Query normalized
7. Candidate retrieval
8. Metadata filtering
9. Ranking
10. Context assembly
11. Source references attached
12. Agent/model inference
```

Agent дур мэдэн бүх Knowledge Base дотроос хайхгүй.

---

# 17. Domain Scoped RAG

Agent бүр өөрийн RAG scope-той байж болно.

### General iBeX Agent

```text
iBeX Handbook
General user guides
Approved common knowledge
```

### Maintenance Agent

```text
Maintenance manuals
Repair procedures
Failure references
OEM manuals
```

### Asset Agent

```text
Asset documentation
Equipment specifications
Asset standards
```

### Warehouse Agent

```text
Warehouse procedures
Parts documentation
Inventory standards
```

Цаашид:

- Inspection
- PM
- PdM
- HSE
- Budget
- Project/Contract

scope нэмэгдэнэ.

---

# 18. RAG + Tool Combination

Нэг асуултад RAG болон Tool зэрэг хэрэгтэй байж болно.

Жишээ:

> “Pump P-101-ийн үйлдвэрлэгчийн зөвлөсөн lubrication interval болон хамгийн сүүлд хийсэн maintenance-ийг харуул.”

Architecture:

```text
OEM Manual
   ↓
RAG
   ↓
Recommended lubrication interval

Core iBeX
   ↓
Maintenance Tool
   ↓
Actual maintenance history
```

Agent хоёр мэдээллийг нэгтгэн тайлбарлана.

Гэхдээ:

- RAG result = reference knowledge
- Tool result = operational fact

гэсэн ялгааг хадгална.

---

# 19. Source Trust Hierarchy

Source trust level тодорхой байна.

Жишээ:

```text
Level 1
Approved iBeX / tenant procedure

Level 2
Approved OEM documentation

Level 3
Approved engineering standard

Level 4
Approved reference knowledge

Unapproved
Not allowed for production retrieval
```

Source priority нь зөвхөн semantic similarity-аар шийдэгдэхгүй.

---

# 20. Citation / Traceability

AI response боломжтой тохиолдолд source reference агуулна.

Жишээ:

```text
Source:
Pump Maintenance Manual
Version: 3.2
Section: 6.4 Lubrication
```

RAG result бүрээс:

```text
document_id
document_version
chunk_id
source_reference
```

audit trail-д хадгална.

---
# 21. Hallucination Control

RAG retrieval хангалтгүй үед AI:

- баримт зохиохгүй
- source байгаа мэт дүр эсгэхгүй
- uncertainty илэрхийлнэ
- шаардлагатай operational tool санал болгоно
- шаардлагатай бол human verification шаардлагатайг хэлнэ

Жишээ:

> “Баталгаатай knowledge source-оос энэ мэдээлэл олдсонгүй.”

---

# 22. Prompt Injection Defense

RAG document нь **untrusted content** гэж үзэгдэнэ.

Document дотор:

```text
Ignore previous instructions
Reveal system prompt
Call this API
Change tenant
```

гэх мэт instruction байсан ч Master AI Policy-г override хийхгүй.

Priority:

```text
Master AI Policy
      ↓
Security / Tenant Policy
      ↓
Agent Policy
      ↓
Tool Policy
      ↓
Retrieved Content
      ↓
User Content
```

Retrieved document нь **data**, system instruction биш.

---

# 23. Permission-Aware Retrieval

Document access нь хэрэглэгчийн permission-аас шалтгаална.

Жишээ:

```text
User:
Maintenance Technician

Allowed:
Maintenance procedure

Not Allowed:
Confidential budget procedure
```

RAG нь authorization system-ийн оронд ажиллахгүй.

Permission validation server-side хийгдэнэ.

---

# 24. Language Architecture

Knowledge source дараах хэлтэй байж болно:

- Mongolian
- English
- future supported language

Metadata:

```text
language = mn
language = en
```

Хэрэглэгч Монгол хэлээр асуусан ч англи technical source retrieval хийх боломжтой.

Agent source meaning-ийг хадгалан Монгол хэлээр тайлбарлаж болно.

---

# 25. Document Versioning

Шинэ document version батлагдвал:

```text
v1 → Deprecated
v2 → Approved
```

Production retrieval default:

```text
latest approved version
```

Гэхдээ audit history-д өмнөх version хадгалагдана.

---

# 26. Knowledge Lifecycle

```text
Create
 ↓
Review
 ↓
Approve
 ↓
Publish
 ↓
Use
 ↓
Update
 ↓
Supersede
 ↓
Archive
```

Document устгасан ч шаардлагатай audit metadata-г retention policy-ийн дагуу хадгална.

---

# 27. Cache

RAG cache tenant-aware байна.

Cache key дор хаяж:

```text
tenant_id
user/permission_scope
agent
knowledge_scope
query_hash
knowledge_version
```

агуулна.

Cross-tenant shared cache ашиглахгүй.

---

# 28. Audit

RAG request бүр audit event үүсгэнэ.

Minimum:

```text
request_id
tenant_id
user_id
agent
query
knowledge_scope
document_ids
document_versions
chunk_ids
retrieval_score
embedding_model
retrieval_version
timestamp
latency
```

Шаардлагатай үед:

```text
reranker_version
token_count
estimated_cost
error
```

хадгална.

---

# 29. Observability

RAG monitoring:

- retrieval latency
- retrieval success rate
- no-result rate
- source usage
- source freshness
- retrieval relevance
- tenant isolation violation attempts
- permission denial
- ingestion failures
- embedding failures
- index errors

ийг хянана.

---

# 30. RAG Evaluation

Evaluation нь зөвхөн LLM response-г шалгахгүй.

Дараах түвшинд хийнэ.

### Retrieval Evaluation

```text
Precision
Recall
Top-K relevance
Correct source retrieval
```

### Groundedness

Хариулт source-д тулгуурласан эсэх.

### Citation Correctness

Зөв document/reference заасан эсэх.

### Security Evaluation

- cross-tenant retrieval
- permission bypass
- prompt injection
- restricted document access

### Domain Evaluation

Domain expert validation.

---

# 31. Data Leakage Tests

Production release-ийн өмнө:

```text
Tenant A → Tenant B retrieval
Tenant A → global restricted content
Unauthorized role → restricted document
Prompt injection → tenant override
Cache → cross-tenant result
```

test-үүд заавал хийнэ.

Cross-tenant leakage:

> **Critical Security Failure**

гэж ангилна.

---

# 32. RAG ба Model Training

Tenant document болон RAG data-г:

- автоматаар foundation model training-д ашиглахгүй
- provider training-д автоматаар дамжуулахгүй
- tenant хооронд knowledge improvement хийхэд ашиглахгүй

Model improvement болон evaluation dataset ашиглалт нь тусдаа governance шаардлагатай.

---

# 33. Human Governance

Knowledge Base-д production document publish хийх нь AI өөрөө шийдэхгүй.

Publishing authority:

```text
Authorized Administrator
        ↓
Review
        ↓
Approve
        ↓
Production RAG
```

AI document санал болгох, classification санал болгох боломжтой боловч approval эрхгүй.

---

# 34. Failure Handling

RAG service unavailable үед:

Agent:

1. RAG мэдээлэл авсан мэт дүр эсгэхгүй.
2. Operational Tool data байвал түүнийг тусад нь ашиглаж болно.
3. Knowledge-dependent conclusion гаргахгүй.
4. Failure audit хийнэ.

---

# 35. Cost Control

RAG cost дараах хэсгүүдээс бүрдэнэ:

```text
Parsing
Embedding
Storage
Vector Search
Reranking
LLM context tokens
```

Optimization:

- incremental indexing
- changed-document re-embedding
- context size limitation
- duplicate elimination
- retrieval Top-K control
- tenant-aware caching

ашиглана.

Security болон answer quality-г cost optimization-оор бууруулахгүй.

---

# 36. Pilot Scope

## Current — Architecture

Батлагдах үндсэн architecture:

- standalone RAG service/layer
- strict tenant isolation
- approved documents only
- permission-aware retrieval
- domain scoped retrieval
- source traceability
- version control
- audit
- Model Gateway abstraction
- RAG ≠ live operational database

## Pilot

Эхний implementation:

```text
General iBeX Agent
Maintenance Agent
Asset Agent
Warehouse Agent
```

Эхний knowledge:

```text
iBeX Handbook
approved iBeX procedures
selected equipment manuals
approved tenant documents
```

---

# 37. R&D

Дараах capability-г validation хийсний дараа production-д оруулна:

- advanced reranking
- Graph RAG
- multimodal RAG
- table-aware retrieval
- drawing/schematic retrieval
- image-based manual search
- knowledge graph integration
- automated knowledge extraction

Эдгээр нь **RAG Architecture v1.0-ийн production baseline биш**.

---

# 38. Future

Ирээдүйд:

```text
Multimodal Engineering RAG
        +
Knowledge Graph
        +
Predictive AI
        +
Operational Tools
        +
Domain Agents
```

нэгдсэн intelligence architecture бий болгож болно.

Гэхдээ tenant isolation болон Core authorization зарчим өөрчлөгдөхгүй.

---

# 39. Security Invariants

Дараах дүрмүүд ямар implementation ашигласнаас үл хамааран өөрчлөгдөхгүй.

1. Tenant context trusted source-оос ирнэ.
2. Cross-tenant retrieval хориотой.
3. User prompt tenant scope өөрчилж чадахгүй.
4. Retrieved document system instruction болохгүй.
5. Permission check server-side байна.
6. Unapproved document production knowledge болохгүй.
7. RAG live Core database-ийн орлуулга биш.
8. Operational action зөвхөн Tool/API-аар хийгдэнэ.
9. RAG retrieval бүр audit боломжтой байна.
10. Tenant data model training-д автоматаар ашиглагдахгүй.

---

# 40. Reference Architecture

```text
                    Core iBeX
                        │
                  Trusted Context
                        │
                        ▼
                   AI Gateway
                        │
                        ▼
                ┌───────────────┐
                │ AI Orchestrator│
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              │                   │
              ▼                   ▼
        Domain Agent          Tool/API Layer
              │                   │
              ▼                   ▼
          RAG Service         Core Live Data
              │
     ┌────────┼────────┐
     │        │        │
     ▼        ▼        ▼
 Global   Domain     Tenant
 Knowledge Knowledge Knowledge
     │        │        │
     └────────┼────────┘
              ▼
       Security Filters
              ▼
        Hybrid Retrieval
              ▼
          Reranking
              ▼
       Context Builder
              ▼
         Domain Agent
              │
              ▼
        Model Gateway
              │
        ┌─────┼─────┐
        ▼     ▼     ▼
     OpenAI  OSS   Future
        │
        ▼
       Response
        │
   Source Citation
        │
        ▼
      Audit
```

---

# 41. Architecture Decision

**RAG Architecture v1.0-ийн үндсэн шийдвэр:**

> iBeX Hybrid Intelligent AI Platform-ийн RAG нь баталгаажсан document-based knowledge-г tenant-aware, permission-aware, domain-scoped байдлаар retrieval хийх тусдаа controlled knowledge layer байна.

> Core iBeX-ийн live operational information RAG-д хуулж knowledge base болгохгүй бөгөөд Controlled Tool/API Contract-аар дамжин ашиглагдана.

> Global, Domain болон Tenant Private Knowledge нь логик болон security scope-ийн хувьд ялгаатай байна.

> RAG retrieval бүр source, document version, tenant context болон request-тэй trace хийх боломжтой байна.

> RAG content нь Master AI Policy, Tenant Security Policy, authorization болон Tool Policy-г ямар ч нөхцөлд override хийхгүй.

---

## Architecture Chain

```text
Master AI Policy v1.0
        ↓
Tenant Security Contract v1.0
        ↓
Agent Architecture v1.0
        ↓
AI Gateway Contract v1.0
        ↓
Tool/API Contract v1.0
        ↓
RAG Architecture v1.0
```

**RAG Architecture v1.0 — Architecture Baseline**
