const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { createWorker } = require("tesseract.js");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const serverless = require("serverless-http");

// Optional: image preprocessing (install sharp for better Tesseract accuracy)
let sharp;
try {
    sharp = require("sharp");
} catch (_) {
    sharp = null;
}

const {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
    UpdateItemCommand
} = require("@aws-sdk/client-dynamodb");

const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// ========================
// BASIC SETUP
// ========================

const app = express();
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const PORT = process.env.PORT || 3001;

// AWS clients (same region as Lambda/DynamoDB)
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const dbClient = new DynamoDBClient({ region: AWS_REGION });
const textractClient = new TextractClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });
const TABLE_NAME = process.env.TABLE_NAME || "OCRJobs";
const S3_BUCKET = process.env.S3_BUCKET || "";

// ========================
// MIDDLEWARE
// ========================

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Strip API Gateway stage prefix so /prod/health and /health both work
app.use((req, res, next) => {
    if (req.path.startsWith("/prod")) {
        req.url = req.url.replace(/^\/prod/, "") || "/";
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

/**
 * Preprocess image for better Tesseract accuracy (grayscale, resize, normalize).
 * Returns path to preprocessed file, or original path if Sharp unavailable.
 */
const preprocessForTesseract = async (imagePath) => {
    if (!sharp) return imagePath;
    const ext = path.extname(imagePath);
    const outPath = path.join(path.dirname(imagePath), `prep-${Date.now()}${ext}`);
    try {
        await sharp(imagePath)
            .grayscale()
            .normalize()
            .resize(null, 1200, { fit: "inside", withoutEnlargement: true })
            .sharpen()
            .toFile(outPath);
        return outPath;
    } catch (e) {
        return imagePath;
    }
};

/**
 * OCR using AWS Textract (high accuracy, same AWS account as DynamoDB).
 * Document.Bytes is the raw buffer (not base64).
 */
const ocrWithTextract = async (imagePath) => {
    const imageBytes = fs.readFileSync(imagePath);
    const command = new DetectDocumentTextCommand({
        Document: { Bytes: imageBytes }
    });
    const result = await textractClient.send(command);
    const blocks = result.Blocks || [];
    const lines = blocks
        .filter((b) => b.BlockType === "LINE" && b.Text)
        .map((b) => b.Text);
    const text = lines.join("\n").trim();
    const confidences = blocks
        .filter((b) => b.BlockType === "LINE" && b.Confidence != null)
        .map((b) => b.Confidence);
    const confidence = confidences.length
        ? Math.round(confidences.reduce((a, c) => a + c, 0) / confidences.length)
        : 95;
    return { text, confidence };
};

/**
 * OCR using Tesseract.js with optional preprocessing and better PSM.
 */
const ocrWithTesseract = async (imagePath, language = "eng") => {
    let toProcess = imagePath;
    let preprocessedPath = null;
    if (sharp) {
        preprocessedPath = await preprocessForTesseract(imagePath);
        toProcess = preprocessedPath;
    }

    const worker = await createWorker();
    await worker.loadLanguage(language);
    await worker.initialize(language);
    // PSM 3 = fully automatic page segmentation (better for mixed content)
    await worker.setParameters({ tessedit_pageseg_mode: 3 });

    const result = await worker.recognize(toProcess);
    await worker.terminate();
    if (preprocessedPath) cleanupFile(preprocessedPath);

    return {
        text: (result.data.text || "").trim(),
        confidence: Math.round(result.data.confidence || 0)
    };
};

/**
 * Main OCR: use AWS Textract first (high accuracy), fallback to Tesseract on failure or no text.
 */
const processOCR = async (imagePath, language = "eng") => {
    try {
        const out = await ocrWithTextract(imagePath);
        if (out && (out.text || out.confidence !== undefined)) return out;
    } catch (e) {
        console.warn("AWS Textract OCR failed, falling back to Tesseract:", e.message);
    }
    return ocrWithTesseract(imagePath, language);
};

// Upload file to S3 (key: jobId/filename). Returns S3 key or null if bucket not set or upload fails.
const uploadImageToS3 = async (filePath, jobId, filename) => {
    if (!S3_BUCKET) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("S3_BUCKET not set in Lambda env; images will not be stored in S3.");
        return null;
    }
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filename) || ".png";
    const safeName = (path.basename(filename) || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${jobId}/${safeName}`;
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

// Save to DynamoDB (optional s3Key). Includes GSI keys so you can query by date (index ByCreatedAt).
const saveOCRRecord = async (jobId, filename, text, confidence, s3Key = null) => {
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
    try {
        await dbClient.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) console.log("DynamoDB save OK:", TABLE_NAME, jobId);
    } catch (e) {
        console.error("DynamoDB PutItem failed:", e.name || e.code, e.message);
        throw new Error(`DynamoDB save failed: ${e.message || e.code || String(e)}`);
    }
};

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
            "GET /health": "Health check",
            "POST /ocr": "Upload image (multipart form field: image)",
            "GET /ocr/:jobId": "Get job result",
            "PUT /ocr/:jobId": "Update job text",
            "DELETE /ocr/:jobId": "Delete job"
        }
    });
});

// Health check
app.get("/health", (_, res) =>
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        environment: isLambda ? "lambda" : "local"
    })
);

// GET /ocr – hint (browser uses GET; OCR requires POST)
app.get("/ocr", (_, res) =>
    res.status(405).json({
        error: "Method Not Allowed",
        message: "Use POST to upload an image. Example: curl -X POST http://localhost:3001/ocr -F \"image=@your-image.jpg\""
    })
);

// Upload image
app.post("/ocr", upload.any(), async(req, res) => {

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files[0];
    const language = req.body.language || "eng";
    const jobId = crypto.randomUUID();

    try {
        const result = await processOCR(file.path, language);
        const s3Key = await uploadImageToS3(file.path, jobId, file.originalname);
        await saveOCRRecord(jobId, file.originalname, result.text, result.confidence, s3Key);
        cleanupFile(file.path);

        const payload = {
            success: true,
            jobId,
            filename: file.originalname,
            language,
            text: result.text,
            confidence: result.confidence
        };
        if (s3Key) payload.s3Key = s3Key;
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
    try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(tempFile, Buffer.from(base64Data, "base64"));
    } catch (e) {
        return res.status(400).json({ error: "Invalid image", message: e.message });
    }
    const jobId = crypto.randomUUID();
    const safeName = (filename && typeof filename === "string") ? filename : `upload-${jobId}.png`;
    try {
        const result = await processOCR(tempFile, language);
        const s3Key = await uploadImageToS3(tempFile, jobId, safeName);
        await saveOCRRecord(jobId, safeName, result.text, result.confidence, s3Key);
        cleanupFile(tempFile);
        const payload = {
            success: true,
            jobId,
            filename: safeName,
            language,
            text: result.text,
            confidence: result.confidence
        };
        if (s3Key) payload.s3Key = s3Key;
        res.json(payload);
    } catch (err) {
        cleanupFile(tempFile);
        console.error("OCR ERROR (base64):", err);
        res.status(500).json({ error: "OCR failed", message: err.message });
    }
});

// Get OCR job
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

        const out = {
            jobId: req.params.jobId,
            filename: data.Item.filename.S,
            text: data.Item.text.S,
            confidence: parseInt(data.Item.confidence.N),
            createdAt: data.Item.createdAt.S
        };
        if (data.Item.s3Key && data.Item.s3Key.S) out.s3Key = data.Item.s3Key.S;
        res.json(out);

    } catch (err) {
        res.status(500).json({
            error: "Fetch failed",
            message: err.message
        });
    }
});

// Delete job (and S3 object if stored)
app.delete("/ocr/:jobId", async(req, res) => {

    try {
        const jobId = req.params.jobId;
        if (S3_BUCKET) {
            const getData = await dbClient.send(
                new GetItemCommand({
                    TableName: TABLE_NAME,
                    Key: { jobId: { S: jobId } },
                    ProjectionExpression: "s3Key"
                })
            );
            if (getData.Item && getData.Item.s3Key && getData.Item.s3Key.S) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: S3_BUCKET,
                        Key: getData.Item.s3Key.S
                    }));
                } catch (e) {
                    console.warn("S3 delete failed:", e.message);
                }
            }
        }
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

// Update text
app.put("/ocr/:jobId", async(req, res) => {

    if (!req.body.text) {
        return res.status(400).json({ error: "No text provided" });
    }

    try {
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