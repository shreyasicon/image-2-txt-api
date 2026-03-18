const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const serverless = require("serverless-http");
const { processOCR } = require("./ocr-process.js");

const {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
    UpdateItemCommand,
    DescribeTableCommand,
    QueryCommand
} = require("@aws-sdk/client-dynamodb");

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { validateAndEnrichOcrPayload, checkSensitivity, checkBlockedWords, getUniqueCategories } = require("./ocr-postprocess.js");

// ========================
// BASIC SETUP
// ========================

const app = express();
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const PORT = process.env.PORT || 3001;

// AWS clients (same region as Lambda/DynamoDB)
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const dbClient = new DynamoDBClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });
const sqsClient = new SQSClient({ region: AWS_REGION });
const TABLE_NAME = process.env.TABLE_NAME || "OCRJobs";
const S3_BUCKET = process.env.S3_BUCKET || "";
const CACHE_TABLE_NAME = process.env.CACHE_TABLE_NAME || "";
const USER_S3_LINKS_TABLE = process.env.USER_S3_LINKS_TABLE || "";
const OCR_QUEUE_URL = process.env.OCR_QUEUE_URL || "";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "";

// Optional: Cognito JWT verifier for authenticated requests (userId from token sub)
let cognitoVerifier = null;
if (COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID) {
    try {
        const { CognitoJwtVerifier } = require("aws-jwt-verify");
        cognitoVerifier = CognitoJwtVerifier.create({
            userPoolId: COGNITO_USER_POOL_ID,
            tokenUse: "id",
            clientId: COGNITO_CLIENT_ID
        });
    } catch (e) {
        console.warn("Cognito verifier init failed:", e.message);
    }
}

// ========================
// MIDDLEWARE
// ========================

// CORS: reflect request origin so CloudFront and any domain work (required when API Gateway CORS is off)
app.use((req, res, next) => {
    const origin = req.headers.origin || req.headers.Origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    if (origin) res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Origin, Accept, X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Strip API Gateway stage prefix so /prod/health and /health both work
app.use((req, res, next) => {
    if (req.path.startsWith("/prod")) {
        req.url = req.url.replace(/^\/prod/, "") || "/";
    }
    next();
});

// Optional: set req.userId from Cognito JWT (Authorization: Bearer <idToken>)
app.use(async (req, res, next) => {
    req.userId = null;
    const auth = req.headers.authorization;
    if (!cognitoVerifier || !auth || !auth.startsWith("Bearer ")) return next();
    const token = auth.slice(7).trim();
    if (!token) return next();
    try {
        const payload = await cognitoVerifier.verify(token);
        req.userId = payload.sub || null;
    } catch (_) {
        // Invalid or expired token – leave req.userId null
    }
    next();
});

// ========================
// UPLOAD CONFIG
// ========================

const uploadsDir = isLambda ? "/tmp" : path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadsDir),
    filename: (_, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
        const allowed = /jpeg|jpg|png|bmp|tiff|webp|gif|pdf/;
        const ok =
            allowed.test(path.extname(file.originalname).toLowerCase()) &&
            allowed.test(file.mimetype);

        ok ? cb(null, true) : cb(new Error("Invalid file type"));
    }
});

// ========================
// HELPERS
// ========================

const cleanupFile = (file) => {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
};

// Upload file to S3. Key: users/{userId}/{jobId}/filename if userId, else jobId/filename.
const uploadImageToS3 = async (filePath, jobId, filename, userId = null) => {
    if (!S3_BUCKET) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("S3_BUCKET not set in Lambda env; images will not be stored in S3.");
        return null;
    }
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filename) || ".png";
    const safeName = (path.basename(filename) || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = userId
        ? `users/${userId}/${jobId}/${safeName}`
        : `${jobId}/${safeName}`;
    const body = fs.readFileSync(filePath);
    const contentType = /\.(jpg|jpeg)$/i.test(ext) ? "image/jpeg" : /\.png$/i.test(ext) ? "image/png" : "application/octet-stream";
    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType
        }));
        return key;
    } catch (e) {
        console.warn("S3 upload failed:", e.message);
        return null;
    }
};

// Save to DynamoDB (optional s3Key, optional userId for "my jobs" GSI).
const saveOCRRecord = async (jobId, filename, text, confidence, s3Key = null, userId = null) => {
    if (!TABLE_NAME) throw new Error("TABLE_NAME (DynamoDB) not configured");
    const createdAt = new Date().toISOString();
    const item = {
        jobId: { S: jobId },
        filename: { S: filename },
        text: { S: text },
        confidence: { N: String(confidence) },
        createdAt: { S: createdAt },
        gsiPk: { S: "JOB" },
        gsiSk: { S: createdAt }
    };
    if (s3Key) item.s3Key = { S: s3Key };
    if (userId) item.userId = { S: userId };
    try {
        await dbClient.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("DynamoDB save OK:", TABLE_NAME, jobId);
    } catch (e) {
        console.error("DynamoDB PutItem failed:", e.name || e.code, e.message);
        throw new Error(`DynamoDB save failed: ${e.message || e.code || String(e)}`);
    }
};

// Save a pending job (SQS async flow). Consumer will update with text/confidence when done.
const savePendingOCRRecord = async (jobId, filename, s3Key, userId = null) => {
    if (!TABLE_NAME) throw new Error("TABLE_NAME (DynamoDB) not configured");
    const createdAt = new Date().toISOString();
    const item = {
        jobId: { S: jobId },
        filename: { S: filename },
        text: { S: "" },
        confidence: { N: "0" },
        status: { S: "pending" },
        createdAt: { S: createdAt },
        gsiPk: { S: "JOB" },
        gsiSk: { S: createdAt }
    };
    if (s3Key) item.s3Key = { S: s3Key };
    if (userId) item.userId = { S: userId };
    await dbClient.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
};

// UserS3Links: link user (Cognito userId) to their S3 objects for easy user-details maintenance
const saveUserS3Link = async (userId, jobId, s3Key, filename) => {
    if (!USER_S3_LINKS_TABLE || !userId || !jobId) return;
    const createdAt = new Date().toISOString();
    try {
        await dbClient.send(new PutItemCommand({
            TableName: USER_S3_LINKS_TABLE,
            Item: {
                userId: { S: userId },
                jobId: { S: jobId },
                s3Key: { S: s3Key || "" },
                filename: { S: filename || "" },
                createdAt: { S: createdAt }
            }
        }));
    } catch (e) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("UserS3Links save failed:", e.message);
    }
};

const deleteUserS3Link = async (userId, jobId) => {
    if (!USER_S3_LINKS_TABLE || !userId || !jobId) return;
    try {
        await dbClient.send(new DeleteItemCommand({
            TableName: USER_S3_LINKS_TABLE,
            Key: { userId: { S: userId }, jobId: { S: jobId } }
        }));
    } catch (e) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("UserS3Links delete failed:", e.message);
    }
};

// ----- OCR result cache (DynamoDB) – keyed by image content hash, TTL 24h -----
const CACHE_TTL_SEC = 24 * 60 * 60;
function contentHash(buffer) {
    return crypto.createHash("md5").update(buffer).digest("hex");
}
async function getCachedOcrResult(imageBuffer) {
    if (!CACHE_TABLE_NAME) return null;
    const hash = contentHash(imageBuffer);
    try {
        const r = await dbClient.send(new GetItemCommand({
            TableName: CACHE_TABLE_NAME,
            Key: { contentHash: { S: hash } }
        }));
        if (!r.Item || !r.Item.result || !r.Item.result.S) return null;
        return JSON.parse(r.Item.result.S);
    } catch (_) {
        return null;
    }
}
async function setCachedOcrResult(imageBuffer, result) {
    if (!CACHE_TABLE_NAME) return;
    const hash = contentHash(imageBuffer);
    const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_SEC;
    try {
        await dbClient.send(new PutItemCommand({
            TableName: CACHE_TABLE_NAME,
            Item: {
                contentHash: { S: hash },
                result: { S: JSON.stringify(result) },
                ttl: { N: String(ttl) }
            }
        }));
    } catch (e) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("Cache set failed:", e.message);
    }
}

// Normalize OCR text for API responses and storage: remove newlines and collapse whitespace
function normalizeOcrText(text) {
    if (!text) return "";
    const withoutBreaks = String(text).replace(/[\r\n]+/g, " ");
    return withoutBreaks.replace(/\s+/g, " ").trim();
}

// ========================
// ROUTES
// ========================

// Root – serve UI when local, JSON when Lambda
app.get("/", (_, res) => {
    if (!isLambda) {
        const indexPath = path.join(__dirname, "..", "index.html");
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
    }
    res.json({
        message: "Image to Text API",
        endpoints: {
            "GET /health": "Health check (liveness)",
            "GET /ready": "Readiness (DynamoDB connectivity)",
            "POST /ocr": "Upload image (multipart). With validation (default) or body skipValidation: true for without validation",
            "POST /ocr/base64": "Upload base64 image (JSON body). With validation (default) or body skipValidation: true for without validation",
            "POST /ocr/base64?async=1": "Upload base64 via SQS (returns 202). Same body; optional skipValidation: true for without validation",
            "GET /ocr?list=mine": "List my OCR jobs (Auth required)",
            "GET /users/me/s3-links": "List my S3 links (DynamoDB UserS3Links, Auth required)",
            "GET /ocr/:jobId": "Get job result",
            "PUT /ocr/:jobId": "Update job text",
            "DELETE /ocr/:jobId": "Delete job"
        },
        validation: "With validation (default): response includes uploadValidation, quality, script. Without validation: send body skipValidation: true or skipValidation: 1 for text/confidence only (faster)."
    });
});

// Health check (liveness – no downstream calls)
app.get("/health", (_, res) =>
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        environment: isLambda ? "lambda" : "local"
    })
);

// Readiness check (DynamoDB reachable – for load balancers / scaling)
app.get("/ready", async (_, res) => {
    if (!TABLE_NAME) {
        return res.status(200).json({ ready: true, dynamodb: "skipped (no table)" });
    }
    try {
        await dbClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        res.json({ ready: true, dynamodb: "ok" });
    } catch (e) {
        res.status(503).json({ ready: false, dynamodb: "error", message: e.message });
    }
});

// GET /ocr?list=mine – list current user's jobs (requires Cognito Authorization header)
const GSI_BY_USER = "ByUserId";
app.get("/ocr", async (req, res) => {
    if (req.query.list !== "mine") {
        return res.status(405).json({
            error: "Method Not Allowed",
            message: "Use POST to upload an image, or GET /ocr?list=mine with Authorization to list your jobs."
        });
    }
    if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized", message: "Send Authorization: Bearer <Cognito Id token> to list your jobs." });
    }
    if (!TABLE_NAME) {
        return res.status(503).json({ error: "Table not configured" });
    }
    try {
        const result = await dbClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: GSI_BY_USER,
            KeyConditionExpression: "userId = :uid",
            ExpressionAttributeValues: { ":uid": { S: req.userId } },
            ScanIndexForward: false,
            Limit: 100
        }));
        const items = (result.Items || []).map((item) => ({
            jobId: item.jobId?.S,
            filename: item.filename?.S,
            text: (item.text?.S || "").slice(0, 200),
            confidence: item.confidence?.N ? parseInt(item.confidence.N, 10) : 0,
            createdAt: item.createdAt?.S,
            s3Key: item.s3Key?.S
        }));
        res.json({ jobs: items });
    } catch (err) {
        if (err.name === "ResourceNotFoundException" || (err.message && err.message.includes("index"))) {
            return res.status(503).json({ error: "ByUserId index not ready", message: "Deploy may need to add GSI ByUserId." });
        }
        res.status(500).json({ error: "List failed", message: err.message });
    }
});

// Get current user's S3 links with presigned preview URLs (DynamoDB UserS3Links)
app.get("/users/me/s3-links", async (req, res) => {
    if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized", message: "Send Authorization: Bearer <Cognito Id token>." });
    }
    if (!USER_S3_LINKS_TABLE) {
        return res.status(503).json({ error: "UserS3Links table not configured" });
    }
    try {
        const result = await dbClient.send(new QueryCommand({
            TableName: USER_S3_LINKS_TABLE,
            KeyConditionExpression: "userId = :uid",
            ExpressionAttributeValues: { ":uid": { S: req.userId } },
            ScanIndexForward: false,
            Limit: 200
        }));
        const items = [];
        const expirySeconds = 3600;
        for (const item of result.Items || []) {
            const jobId = item.jobId?.S;
            const s3Key = item.s3Key?.S;
            const filename = item.filename?.S;
            const createdAt = item.createdAt?.S;
            let previewUrl = null;
            if (S3_BUCKET && s3Key) {
                try {
                    previewUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }), { expiresIn: expirySeconds });
                } catch (e) {
                    if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("Presign failed for", s3Key, e.message);
                }
            }
            items.push({ jobId, s3Key, filename, createdAt, previewUrl });
        }
        res.json({ userId: req.userId, items });
    } catch (err) {
        res.status(500).json({ error: "List failed", message: err.message });
    }
});

function isSkipValidation(body) {
    const v = body && body.skipValidation;
    return v === true || v === "true" || v === "1";
}

// Upload image
app.post("/ocr", upload.any(), async(req, res) => {

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files[0];
    const language = req.body.language || "eng";
    const jobId = crypto.randomUUID();
    const skipValidation = isSkipValidation(req.body);
    const userId = req.userId || null;
    let imageBuffer;
    try {
        imageBuffer = fs.readFileSync(file.path);
    } catch (_) {
        return res.status(400).json({ error: "Could not read file" });
    }

    try {
        let result = await getCachedOcrResult(imageBuffer);
        if (!result) {
            result = await processOCR(file.path, language);
            const text = result.text || "";
            const blocked = checkBlockedWords(text);
            if (blocked.blocked) {
                cleanupFile(file.path);
                const reason = (blocked.categories && blocked.categories.length) ? blocked.categories.join(", ") : "Blocked content";
                if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("[OCR] Blocked:", reason);
                return res.status(400).json({ message: "Extracted text cannot be displayed.", reason, categories: blocked.categories || [] });
            }
            const sensitivity = checkSensitivity(text);
            if (sensitivity.sensitive) {
                cleanupFile(file.path);
                const categories = getUniqueCategories(sensitivity.types, sensitivity.matchedTerms);
                const reason = categories.length ? categories.join(", ") : "Sensitive content";
                if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("[OCR] Blocked:", reason);
                return res.status(400).json({ message: "Extracted text cannot be displayed.", reason, categories });
            }
            setCachedOcrResult(imageBuffer, { text: result.text, confidence: result.confidence });
        }
        const textRaw = result.text || "";
        const text = normalizeOcrText(textRaw);
        const confidence = result.confidence ?? 0;
        const s3Key = await uploadImageToS3(file.path, jobId, file.originalname, userId);
        await saveOCRRecord(jobId, file.originalname, text, confidence, s3Key, userId);
        if (userId && s3Key) await saveUserS3Link(userId, jobId, s3Key, file.originalname);
        cleanupFile(file.path);

        const payload = {
            success: true,
            jobId,
            filename: file.originalname,
            language,
            text,
            confidence
        };
        if (s3Key) payload.s3Key = s3Key;
        if (!skipValidation) {
            const enriched = validateAndEnrichOcrPayload({
                filename: file.originalname,
                contentType: file.mimetype || "",
                sizeBytes: file.size || 0,
                text,
                confidence
            });
            payload.uploadValidation = enriched.uploadValidation;
            payload.quality = enriched.quality;
            payload.script = enriched.script;
        }
        res.json(payload);

    } catch (err) {
        cleanupFile(file.path);
        console.error("OCR ERROR:", err);
        res.status(500).json({
            error: "OCR failed",
            message: err.message
        });
    }
});

// Upload image as base64 (JSON body) – use this when calling Lambda; multipart often fails through API Gateway
app.post("/ocr/base64", async(req, res) => {
    const { image, language = "eng", filename } = req.body || {};
    if (!image) {
        return res.status(400).json({ error: "No image provided", message: "Send JSON: { \"image\": \"data:image/png;base64,...\" }" });
    }
    const tempFile = path.join(uploadsDir, `tmp-${Date.now()}.png`);
    let sizeBytes = 0;
    let contentType = "image/png";
    let buf;
    try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const match = image.match(/^data:(image\/\w+);base64,/);
        if (match) contentType = match[1];
        buf = Buffer.from(base64Data, "base64");
        sizeBytes = buf.length;
        fs.writeFileSync(tempFile, buf);
    } catch (e) {
        return res.status(400).json({ error: "Invalid image", message: e.message });
    }
    const jobId = crypto.randomUUID();
    const safeName = (filename && typeof filename === "string") ? filename : `upload-${jobId}.png`;
    const skipValidation = isSkipValidation(req.body);
    const userId = req.userId || null;
    const useAsync = OCR_QUEUE_URL && (req.body.async === true || req.body.async === "true" || req.query.async === "1" || req.query.async === "true");

    try {
        if (useAsync) {
            const s3Key = await uploadImageToS3(tempFile, jobId, safeName, userId);
            await savePendingOCRRecord(jobId, safeName, s3Key, userId);
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: OCR_QUEUE_URL,
                MessageBody: JSON.stringify({
                    jobId,
                    s3Key,
                    bucket: S3_BUCKET,
                    filename: safeName,
                    userId: userId || null,
                    language
                })
            }));
            cleanupFile(tempFile);
            return res.status(202).json({
                jobId,
                status: "processing",
                message: "Job queued. Poll GET /ocr/" + jobId + " for result."
            });
        }

        let result = await getCachedOcrResult(buf);
        if (!result) {
            result = await processOCR(tempFile, language);
            const text = result.text || "";
            const blockedBase64 = checkBlockedWords(text);
            if (blockedBase64.blocked) {
                cleanupFile(tempFile);
                const reason = (blockedBase64.categories && blockedBase64.categories.length) ? blockedBase64.categories.join(", ") : "Blocked content";
                if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("[OCR base64] Blocked:", reason);
                return res.status(400).json({ message: "Extracted text cannot be displayed.", reason, categories: blockedBase64.categories || [] });
            }
            const sensitivity = checkSensitivity(text);
            if (sensitivity.sensitive) {
                cleanupFile(tempFile);
                const categories = getUniqueCategories(sensitivity.types, sensitivity.matchedTerms);
                const reason = categories.length ? categories.join(", ") : "Sensitive content";
                if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("[OCR base64] Blocked:", reason);
                return res.status(400).json({ message: "Extracted text cannot be displayed.", reason, categories });
            }
            setCachedOcrResult(buf, { text: result.text, confidence: result.confidence });
        }
        const textRaw = result.text || "";
        const text = normalizeOcrText(textRaw);
        const confidence = result.confidence ?? 0;
        const s3Key = await uploadImageToS3(tempFile, jobId, safeName, userId);
        await saveOCRRecord(jobId, safeName, text, confidence, s3Key, userId);
        if (userId && USER_S3_LINKS_TABLE && s3Key) await saveUserS3Link(userId, jobId, s3Key, safeName);
        cleanupFile(tempFile);
        const payload = {
            success: true,
            jobId,
            filename: safeName,
            language,
            text,
            confidence
        };
        if (s3Key) payload.s3Key = s3Key;
        if (!skipValidation) {
            const enriched = validateAndEnrichOcrPayload({
                filename: safeName,
                contentType,
                sizeBytes,
                text,
                confidence
            });
            payload.uploadValidation = enriched.uploadValidation;
            payload.quality = enriched.quality;
            payload.script = enriched.script;
        }
        res.json(payload);
    } catch (err) {
        cleanupFile(tempFile);
        console.error("OCR ERROR (base64):", err);
        res.status(500).json({ error: "OCR failed", message: err.message });
    }
});

// Get OCR job (if item has userId, requester must be that user when authenticated)
app.get("/ocr/:jobId", async(req, res) => {

    try {
        const data = await dbClient.send(
            new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { jobId: { S: req.params.jobId } }
            })
        );

        if (!data.Item) {
            return res.status(404).json({ error: "Job not found" });
        }
        const itemUserId = data.Item.userId && data.Item.userId.S ? data.Item.userId.S : null;
        if (itemUserId && req.userId && itemUserId !== req.userId) {
            return res.status(403).json({ error: "Forbidden", message: "This job belongs to another user." });
        }

        const out = {
            jobId: req.params.jobId,
            filename: data.Item.filename.S,
            text: (data.Item.text && data.Item.text.S) ? data.Item.text.S : "",
            confidence: data.Item.confidence && data.Item.confidence.N ? parseInt(data.Item.confidence.N, 10) : 0,
            createdAt: data.Item.createdAt.S
        };
        if (data.Item.status && data.Item.status.S) out.status = data.Item.status.S;
        if (data.Item.s3Key && data.Item.s3Key.S) out.s3Key = data.Item.s3Key.S;
        res.json(out);

    } catch (err) {
        res.status(500).json({
            error: "Fetch failed",
            message: err.message
        });
    }
});

// Delete job (and S3 object if stored; remove from UserS3Links if user-linked)
app.delete("/ocr/:jobId", async(req, res) => {

    try {
        const jobId = req.params.jobId;
        const getData = await dbClient.send(
            new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { jobId: { S: jobId } },
                ProjectionExpression: "s3Key, userId"
            })
        );
        if (!getData.Item) {
            return res.status(404).json({ error: "Job not found" });
        }
        const itemUserId = getData.Item.userId && getData.Item.userId.S ? getData.Item.userId.S : null;
        if (itemUserId && req.userId && itemUserId !== req.userId) {
            return res.status(403).json({ error: "Forbidden", message: "This job belongs to another user." });
        }
        if (S3_BUCKET && getData.Item.s3Key && getData.Item.s3Key.S) {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: getData.Item.s3Key.S
                }));
            } catch (e) {
                console.warn("S3 delete failed:", e.message);
            }
        }
        if (itemUserId) await deleteUserS3Link(itemUserId, jobId);
        await dbClient.send(
            new DeleteItemCommand({
                TableName: TABLE_NAME,
                Key: { jobId: { S: jobId } }
            })
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({
            error: "Delete failed",
            message: err.message
        });
    }
});

// Update text (if job has userId, requester must be that user)
app.put("/ocr/:jobId", async(req, res) => {

    if (!req.body.text) {
        return res.status(400).json({ error: "No text provided" });
    }

    try {
        const getData = await dbClient.send(
            new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { jobId: { S: req.params.jobId } },
                ProjectionExpression: "userId"
            })
        );
        if (!getData.Item) {
            return res.status(404).json({ error: "Job not found" });
        }
        const itemUserId = getData.Item.userId && getData.Item.userId.S ? getData.Item.userId.S : null;
        if (itemUserId && req.userId && itemUserId !== req.userId) {
            return res.status(403).json({ error: "Forbidden", message: "This job belongs to another user." });
        }
        await dbClient.send(
            new UpdateItemCommand({
                TableName: TABLE_NAME,
                Key: { jobId: { S: req.params.jobId } },
                UpdateExpression: "SET #t = :txt",
                ExpressionAttributeNames: { "#t": "text" },
                ExpressionAttributeValues: {
                    ":txt": { S: req.body.text }
                }
            })
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({
            error: "Update failed",
            message: err.message
        });
    }
});

// 404 fallback
app.use((_, res) =>
    res.status(404).json({ error: "Not found" })
);

// Global error handler – catch uncaught errors (e.g. from multer) and return JSON
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message || String(err)
    });
});

// ========================
// EXPORT FOR LAMBDA
// ========================

const lambdaHandler = serverless(app);

module.exports.handler = async (event, context) => {
    try {
        // Strip API Gateway stage prefix (e.g. /prod) so GET /prod and GET /prod/health work
        const stage = (event.requestContext && event.requestContext.stage) || "prod";
        const prefix = "/" + stage;
        if (event.rawPath && event.rawPath.startsWith(prefix)) {
            event = { ...event };
            event.rawPath = event.rawPath.slice(prefix.length) || "/";
            if (event.requestContext) {
                event.requestContext = { ...event.requestContext };
                if (event.requestContext.http) {
                    event.requestContext.http = { ...event.requestContext.http, path: event.rawPath };
                }
            }
        }
        return await lambdaHandler(event, context);
    } catch (err) {
        console.error("Lambda handler error:", err);
        return {
            statusCode: 500,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
            body: JSON.stringify({
                error: "Internal Server Error",
                message: err.message || String(err)
            })
        };
    }
};

// ===========
// LOCAL RUN SUPPORT
// =============

if (!isLambda) {
    const MAX_PORT = 3010;
    const tryListen = (port) => {
        if (port > MAX_PORT) {
            console.error(`No free port between ${PORT} and ${MAX_PORT}. Stop the process using port ${PORT} (e.g. taskkill /F /PID <pid> on Windows).`);
            process.exit(1);
        }
        const server = app.listen(port, () => {
            console.log(`🚀 OCR API running locally on http://localhost:${port}`);
        });
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.warn(`Port ${port} in use. Trying ${port + 1}...`);
                tryListen(port + 1);
            } else {
                throw err;
            }
        });
    };
    tryListen(PORT);
}