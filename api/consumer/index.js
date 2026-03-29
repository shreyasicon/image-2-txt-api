"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { processOCR } = require("./ocr-process.js");
const {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    UpdateItemCommand
} = require("@aws-sdk/client-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { checkSensitivity, checkBlockedWords, getUniqueCategories } = require("./ocr-postprocess.js");

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.TABLE_NAME || "OCRJobs";
const S3_BUCKET = process.env.S3_BUCKET || "";
const CACHE_TABLE_NAME = process.env.CACHE_TABLE_NAME || "";
const USER_S3_LINKS_TABLE = process.env.USER_S3_LINKS_TABLE || "";
const REDIS_URL = process.env.REDIS_URL || "";
const CACHE_TTL_SEC = 24 * 60 * 60;
const REDIS_PREFIX = "ocr:";

const dbClient = new DynamoDBClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });

let redisClient = null;
if (REDIS_URL) {
    try {
        const Redis = require("ioredis");
        redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
    } catch (e) {
        console.warn("Redis (ElastiCache) not available:", e.message);
    }
}

function contentHash(buffer) {
    return crypto.createHash("md5").update(buffer).digest("hex");
}

async function getCachedOcrResult(imageBuffer) {
    const hash = contentHash(imageBuffer);
    if (redisClient) {
        try {
            const raw = await redisClient.get(REDIS_PREFIX + hash);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
    }
    if (!CACHE_TABLE_NAME) return null;
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
    const hash = contentHash(imageBuffer);
    const val = JSON.stringify(result);
    if (redisClient) {
        try {
            await redisClient.setex(REDIS_PREFIX + hash, CACHE_TTL_SEC, val);
        } catch (_) {}
    }
    if (!CACHE_TABLE_NAME) return;
    const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_SEC;
    try {
        await dbClient.send(new PutItemCommand({
            TableName: CACHE_TABLE_NAME,
            Item: {
                contentHash: { S: hash },
                result: { S: val },
                ttl: { N: String(ttl) }
            }
        }));
    } catch (e) {
        console.warn("Cache set failed:", e.message);
    }
}

function normalizeOcrText(text) {
    if (!text) return "";
    const withoutBreaks = String(text).replace(/[\r\n]+/g, " ");
    return withoutBreaks.replace(/\s+/g, " ").trim();
}

async function updateJobCompleted(jobId, text, confidence) {
    await dbClient.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { jobId: { S: jobId } },
        UpdateExpression: "SET #t = :txt, #c = :conf, #s = :status",
        ExpressionAttributeNames: { "#t": "text", "#c": "confidence", "#s": "status" },
        ExpressionAttributeValues: {
            ":txt": { S: text },
            ":conf": { N: String(confidence) },
            ":status": { S: "completed" }
        }
    }));
}

async function updateJobFailed(jobId, reason) {
    await dbClient.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { jobId: { S: jobId } },
        UpdateExpression: "SET #s = :status, #t = :txt",
        ExpressionAttributeNames: { "#s": "status", "#t": "text" },
        ExpressionAttributeValues: {
            ":status": { S: "failed" },
            ":txt": { S: reason || "OCR processing failed" }
        }
    }));
}

async function saveUserS3Link(userId, jobId, s3Key, filename) {
    if (!USER_S3_LINKS_TABLE || !userId || !jobId) return;
    const createdAt = new Date().toISOString();
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
}

async function processOneMessage(body) {
    const { jobId, s3Key, bucket, filename, userId, language, skipPostprocess } = body;
    const rawExtract = skipPostprocess === true || skipPostprocess === "true";
    if (!jobId || !s3Key || !bucket) {
        throw new Error("Missing jobId, s3Key or bucket in SQS message");
    }
    const bucketName = bucket;
    const tmpPath = path.join("/tmp", `ocr-${jobId}-${Date.now()}${path.extname(filename) || ".png"}`);

    try {
        const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
        const response = await s3Client.send(getCmd);
        const chunks = [];
        for await (const chunk of response.Body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(tmpPath, buffer);

        let result = await getCachedOcrResult(buffer);
        if (!result) {
            result = await processOCR(tmpPath, language || "eng");
            const text = result.text || "";
            if (!rawExtract) {
                const blocked = checkBlockedWords(text);
                if (blocked.blocked) {
                    const reason = (blocked.categories && blocked.categories.length) ? blocked.categories.join(", ") : "Blocked content";
                    await updateJobFailed(jobId, "Blocked: " + reason);
                    return;
                }
                const sensitivity = checkSensitivity(text);
                if (sensitivity.sensitive) {
                    const categories = getUniqueCategories(sensitivity.types, sensitivity.matchedTerms);
                    const reason = categories.length ? categories.join(", ") : "Sensitive content";
                    await updateJobFailed(jobId, "Sensitive: " + reason);
                    return;
                }
            }
            await setCachedOcrResult(buffer, { text: result.text, confidence: result.confidence });
        }

        const textRaw = result.text || "";
        const text = normalizeOcrText(textRaw);
        const confidence = result.confidence ?? 0;
        await updateJobCompleted(jobId, text, confidence);
        if (userId && USER_S3_LINKS_TABLE) {
            await saveUserS3Link(userId, jobId, s3Key, filename || "");
        }
    } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
}

exports.handler = async (event) => {
    for (const record of event.Records || []) {
        try {
            const body = JSON.parse(record.body || "{}");
            await processOneMessage(body);
        } catch (err) {
            console.error("Consumer error for message:", record.messageId, err);
            throw err;
        }
    }
    return { processed: (event.Records || []).length };
};
