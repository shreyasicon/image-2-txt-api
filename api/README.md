# OCR API (Image to Text)

## Project structure

- **Root (`/`)**  
  - `deploy.js` – deploys Lambda, API Gateway, DynamoDB, IAM (Textract + DynamoDB).  
  - `package.json` – dependencies for **deploy only** (e.g. `archiver`, `aws-sdk`).  
  - `index.html`, `app.js` – optional local frontend for the API.

- **`lambda-code/`**  
  - `server.js` – Lambda handler (Express app: OCR, DynamoDB).  
  - `package.json` – dependencies for the **Lambda runtime** (Express, Textract, Tesseract, etc.).  
  - No duplicate frontend here; the API is used by the root frontend or any client.

The two `package.json` files are **intentional**: one for the deploy script (root), one for the Lambda (lambda-code). Do not remove either.

## Deploy

```bash
npm install          # root deps for deploy
node deploy.js
```

This creates or updates:

- **DynamoDB** (OCR jobs, cache, user S3 links), **S3** bucket, **Cognito** (if needed)
- **SQS queue `OCRJobQueue`** – used for async OCR (API enqueues, consumer processes)
- **API Lambda** – receives `POST /ocr/base64`; if `?async=1`, enqueues to SQS and returns 202 + `jobId`
- **Consumer Lambda `ocr-sqs-consumer`** – triggered by SQS, runs OCR, updates job in DynamoDB

If you created the queue manually, run `node deploy.js` from the `api` folder so the API Lambda gets `OCR_QUEUE_URL` and the consumer Lambda is attached to the queue (event source mapping). Without that, async OCR and the queue will not work.

## Redis (ElastiCache) cache

The **SQS consumer** can use Redis (ElastiCache) to cache OCR results by content hash. When `REDIS_URL` is set and the consumer is in the same VPC as Redis, it will read/write cache there (in addition to DynamoDB), which speeds up repeated OCR for the same image.

**If you already have a cluster** (e.g. `ocr-cache-redis` in the console with subnet group `ocr-cache-subnets` and security group `ocr-redis-sg`):

```bash
node wire-redis.js
```

This sets the consumer Lambda’s `REDIS_URL` and VpcConfig (subnets + security group) so it can reach your existing Redis. After that, `node deploy.js` will keep `REDIS_URL` and VpcConfig when updating the consumer.

**If you don’t have a cluster yet:** run `node create-elasticache.js` to create the cluster, subnet group, and security group, then it will wire the consumer for you.

## Run Lambda locally

```bash
cd lambda-code
npm install
npm start
```
