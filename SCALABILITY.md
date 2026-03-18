# Scalability – Image-to-Text API & Webapp

This document describes how the project is built for scalability and what can be done to improve it further (e.g. for assignment points).

---

## 1. Current Scalability Features

### 1.1 Backend (OCR API)

| Aspect | Implementation | Why it scales |
|--------|----------------|---------------|
| **Compute** | AWS Lambda | Auto-scales with request count; no servers to manage; pay per invocation. |
| **API** | API Gateway (HTTP API) | Managed, auto-scaling HTTP layer; throttling and caching options. |
| **Database** | DynamoDB | Serverless NoSQL; auto-scaling read/write capacity; single-digit ms latency. |
| **Storage** | S3 for images | Durable, highly available object store; scales with object count. |
| **Stateless design** | No in-memory session; jobId in DB | Any Lambda instance can serve any request; horizontal scaling is natural. |
| **OCR engine** | AWS Textract (with Tesseract fallback) | Textract is managed and scales with usage. |

### 1.2 Frontend (Webapp)

| Aspect | Implementation | Why it scales |
|--------|----------------|---------------|
| **Hosting** | S3 + CloudFront | Static assets; CDN caches at edge; low latency globally. |
| **Static export** | Next.js `output: 'export'` | Pre-built HTML/JS/CSS; no server at runtime; cheap to scale. |
| **Cache control** | HTML: no-cache; static assets: long TTL + immutable | New deployments visible quickly; JS/CSS/fonts cached at edge (less origin load). |
| **Security headers (edge)** | CloudFront Response Headers Policy | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection applied at edge. |
| **Static-asset cache behavior** | Path pattern `/_next/static/*` with 1-year TTL | Fewer requests to S3; better latency for repeat visitors. |
| **Auth** | AWS Cognito (User Pool) | Managed identity; JWT verification in API; users linked to their data. |
| **User data** | OCR jobs stored with `userId` (Cognito sub); GSI ByUserId; S3 prefix `users/{userId}/` | Per-user isolation; scalable list "my jobs". |

### 1.3 Cross-cutting

- **CORS** configured so the webapp can call the API from different origins.
- **Structured APIs** (REST: POST/GET/PUT/DELETE) for OCR jobs; easy to add clients and gateways.

---

## 2. Improvements for More “Scalability Points”

Below are concrete improvements that strengthen scalability and are good to mention in reports or demos.

### 2.1 Caching (API + Webapp)

- **OCR result cache (DynamoDB)**: Table `OCRCache` stores OCR results keyed by image content hash (MD5). Repeated identical images are served from cache (TTL 24h), reducing Textract/Tesseract calls and improving latency and cost.
- **SQS consumer cache**: The OCR SQS consumer Lambda also reads/writes the same DynamoDB cache table when processing queued jobs, so async and sync flows both benefit from the cache.
- **Webapp client-side cache**: OCR results are cached in `sessionStorage` (1h TTL) by `jobId`. Frequently accessed job details (e.g. from My Uploads or after polling) are served from cache when available, reducing API calls.
- **Where is ElastiCache for the webapp?** The webapp (browser) **cannot** connect to ElastiCache — it lives in your VPC. Caching that benefits the webapp is: (1) **Browser**: `sessionStorage` (already in the webapp). (2) **Backend**: DynamoDB `OCRCache` (API + SQS consumer). (3) **Optional Redis**: Run `node api/create-elasticache.js` to create Amazon ElastiCache (Redis). The **SQS consumer Lambda** then uses Redis (when `REDIS_URL` is set) to cache OCR results by content hash; the webapp benefits because API/consumer responses are faster when cache hits. After running the script, redeploy: `node api/deploy.js`.
- **Deploy script**: Always runs `npm run build` so the latest UI is deployed (no stale `out/`).
- **S3 upload**: HTML files use `Cache-Control: max-age=0, no-cache, no-store, must-revalidate` so browsers and CloudFront don’t serve old UI after deploy.
- **CloudFront**: Invalidation `/*` after each upload so edge caches refresh.

### 2.2 Health & Readiness

- **API**: `GET /health` returns 200 (liveness). `GET /ready` checks DynamoDB connectivity and returns 200 or 503 (readiness for load balancers and auto-scaling).
- **Webapp**: Can call the OCR API `/health` from the dashboard or a status page to show API availability.

### 2.3 Rate Limiting & Backpressure

- **API Gateway**: Use usage plans and API keys, or throttle by path (e.g. stricter limits on `/ocr/base64`).
- **Lambda**: Reserved concurrency to cap max concurrent executions and protect downstream (DynamoDB, Textract). Prevents one tenant from consuming all capacity.

### 2.4 Async Processing (SQS queue)

- **Pattern**: User uploads image → API stores image in S3, writes pending job to DynamoDB, sends message to **Amazon SQS** (`OCRJobQueue`) → returns 202 with `jobId` → **Consumer Lambda** (triggered by SQS) downloads image, runs OCR (with DynamoDB cache), updates job → client polls `GET /ocr/:jobId` until `status: completed`.
- **Webapp**: Checkbox “Use SQS queue” on Upload page uses `POST /ocr/base64?async=1` and polls until the job is ready; results are cached client-side.
- **Benefit**: Decouples upload from OCR; API stays fast; consumer scales with queue depth; no timeout for large documents.

### 2.5 Database & Storage

- **DynamoDB**: Use on-demand capacity if traffic is spiky; use GSIs for queries (e.g. by user or status). Already using jobId as key for direct access.
- **S3**: Lifecycle rules to move old images to cheaper storage (e.g. Glacier) or delete after retention; reduces cost and keeps the main bucket small.

### 2.6 Observability

- **CloudWatch**: Logs from Lambda and API Gateway; metrics (invocations, duration, errors). Set alarms on error rate and latency.
- **X-Ray**: Enable tracing on Lambda and API Gateway to see bottlenecks (e.g. DynamoDB or Textract latency).
- **Structured logging**: Log requestId, jobId, and timing in JSON so logs are queryable and linkable to traces.

### 2.7 Security & Resilience

- **Validation**: Reject oversized payloads and invalid content types early (e.g. in API Gateway or Lambda) to avoid wasted work.
- **Sensitive content**: Already blocking PII/sensitive text in OCR output; reduces risk and compliance scope.
- **HTTPS only**: API and webapp served over TLS; CloudFront and API Gateway handle termination.

### 2.8 Multi-region (advanced)

- **API**: Deploy Lambda + API Gateway in a second region and use Route 53 latency-based routing.
- **Webapp**: Duplicate S3 bucket + CloudFront in another region; same Route 53 for the frontend.
- **DynamoDB**: Global tables for multi-region replication if you need strong read scalability across regions.

---

## 3. Checklist for “Scalability” Points (summary)

- [x] **Serverless compute** (Lambda) – auto-scaling, no server management  
- [x] **Managed API** (API Gateway) – scalable entry point  
- [x] **NoSQL database** (DynamoDB) – scalable, low-latency persistence  
- [x] **Object storage** (S3) – scalable image storage  
- [x] **CDN** (CloudFront) – edge caching, global delivery  
- [x] **Stateless API** – no server-side session; jobId in DB  
- [x] **Cache control & invalidation** – fresh UI after deploy  
- [x] **Health & readiness** – `/health` and `/ready` (DynamoDB check) for load balancers and monitoring  
- [x] **AWS cache (DynamoDB)** – OCR result cache table (`OCRCache`) keyed by image hash; TTL 24h  
- [x] **Cognito** – User Pool + App Client; JWT verification in API; webapp sign-in/sign-up; jobs and S3 keys linked to `userId`  
- [x] **Per-user data** – GSI ByUserId; `GET /ocr?list=mine`; S3 prefix `users/{userId}/`  
- [x] **Webapp: CloudFront Response Headers Policy** – security headers at edge (HSTS, nosniff, etc.)  
- [x] **Webapp: static-asset cache** – `/_next/static/*` long TTL + S3 `Cache-Control: immutable` on upload  
- [ ] **Rate limiting / throttling** – protect backend and fairness  
- [x] **Async job pattern (SQS)** – API → SQS → Consumer Lambda; webapp option “Use SQS queue” and client-side cache for OCR results  
- [ ] **Structured logging & alarms** – observability and scaling decisions  
- [ ] **Reserved concurrency** (optional) – protect downstream services  

Implementing the items in section 2 (health, rate limiting, logging, optional async pattern and reserved concurrency) will give you strong, demonstrable scalability points for reports and grading.
