/**
 * Lambda handler: serve static Next.js export from S3 (API Gateway HTTP API payload).
 * BUCKET env = S3 bucket name. Paths map to keys (trailingSlash export: /dashboard/vault -> dashboard/vault/index.html).
 */
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET = process.env.BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const s3 = new S3Client({ region: REGION });

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
};

function getContentType(key) {
  const i = key.lastIndexOf(".");
  const ext = i >= 0 ? key.slice(i).toLowerCase() : "";
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function isBinary(ct) {
  return /^image\//.test(ct) || /^font\//.test(ct) || ct === "application/octet-stream" || ct === "application/vnd.ms-fontobject";
}

/** Map request path to S3 key (trailingSlash export: /dashboard/vault -> dashboard/vault/index.html). */
function pathToKey(rawPath) {
  let key = (rawPath || "/").replace(/^\//, "").replace(/\/$/, "") || "index";
  if (key === "index") return "index.html";
  if (!/\.(html?|js|css|json|ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot|txt)$/i.test(key)) {
    key = key + "/index.html";
  }
  return key;
}

exports.handler = async (event) => {
  if (!BUCKET) {
    return { statusCode: 500, body: "BUCKET not configured", headers: { "content-type": "text/plain" } };
  }
  const rawPath = event.rawPath || event.path || "/";
  const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return { statusCode: 405, body: "Method Not Allowed", headers: { "content-type": "text/plain" } };
  }

  let key = pathToKey(rawPath);
  const contentType = getContentType(key);
  const binary = isBinary(contentType);

  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const resp = await s3.send(cmd);
    const body = await resp.Body.transformToByteArray();
    const headers = {
      "content-type": contentType,
      "cache-control": key.endsWith(".html") ? "no-cache, no-store, must-revalidate" : (key.includes("_next/static") ? "public, max-age=31536000, immutable" : "public, max-age=604800"),
    };
    if (binary) {
      return { statusCode: 200, headers, body: Buffer.from(body).toString("base64"), isBase64Encoded: true };
    }
    return { statusCode: 200, headers, body: Buffer.from(body).toString("utf-8") };
  } catch (e) {
    if (e.name === "NoSuchKey") {
      const fallback = key.endsWith("/index.html") ? key.slice(0, -"/index.html".length) : key + "/index.html";
      try {
        const cmd2 = new GetObjectCommand({ Bucket: BUCKET, Key: fallback });
        const r2 = await s3.send(cmd2);
        const body2 = await r2.Body.transformToByteArray();
        const ct2 = getContentType(fallback);
        const binary2 = isBinary(ct2);
        const headers2 = {
          "content-type": ct2,
          "cache-control": fallback.endsWith(".html") ? "no-cache, no-store, must-revalidate" : "public, max-age=604800",
        };
        if (binary2) {
          return { statusCode: 200, headers: headers2, body: Buffer.from(body2).toString("base64"), isBase64Encoded: true };
        }
        return { statusCode: 200, headers: headers2, body: Buffer.from(body2).toString("utf-8") };
      } catch (_) {}
    }
    if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) {
      try {
        const indexCmd = new GetObjectCommand({ Bucket: BUCKET, Key: "index.html" });
        const r = await s3.send(indexCmd);
        const body = await r.Body.transformToByteArray();
        return {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache, no-store, must-revalidate" },
          body: Buffer.from(body).toString("utf-8"),
        };
      } catch (_) {}
    }
    console.error("S3 GetObject error:", e);
    return { statusCode: 500, body: "Internal Server Error", headers: { "content-type": "text/plain" } };
  }
};
