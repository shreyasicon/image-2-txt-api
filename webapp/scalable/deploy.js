/**
 * Deploy webapp to AWS (S3 + CloudFront). Run from this folder: node deploy.js
 * Prereqs: npm run build (or script runs it), AWS credentials configured.
 */
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const sts = new AWS.STS();

AWS.config.update({ region: "us-east-1" });

const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();
const WEBAPP_BUCKET_PREFIX = "image2text-webapp";
const OUT_DIR = path.join(__dirname, "out");

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain"
  };
  return map[ext] || "application/octet-stream";
}

function getAllFiles(dir, base = "") {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const rel = path.join(base, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results.push(...getAllFiles(full, rel));
    else results.push(rel);
  }
  return results;
}

async function getAccountId() {
  const data = await sts.getCallerIdentity().promise();
  return data.Account;
}

async function ensureBucket(bucketName) {
  try {
    await s3.headBucket({ Bucket: bucketName }).promise();
    console.log("S3 bucket exists:", bucketName);
  } catch (e) {
    if (e.code === "NotFound" || e.statusCode === 404 || e.code === "NoSuchBucket") {
      await s3.createBucket({ Bucket: bucketName }).promise();
      console.log("S3 bucket created:", bucketName);
    } else throw e;
  }
}

async function createOAC() {
  const list = await cloudfront.listOriginAccessControls({ MaxItems: "100" }).promise();
  const existing = (list.OriginAccessControlList?.Items || []).find(
    (o) => o.OriginAccessControl?.Name === "webapp-oac"
  );
  if (existing) {
    console.log("Origin Access Control exists:", existing.Id);
    return existing.Id;
  }
  const created = await cloudfront.createOriginAccessControl({
    OriginAccessControlConfig: {
      Name: "webapp-oac",
      OriginAccessControlOriginType: "s3",
      SigningBehavior: "always",
      SigningProtocol: "sigv4"
    }
  }).promise();
  console.log("Origin Access Control created:", created.OriginAccessControl?.Id);
  return created.OriginAccessControl?.Id;
}

async function createDistribution(bucketName, oacId, region) {
  const list = await cloudfront.listDistributions({ MaxItems: "100" }).promise();
  const items = list.DistributionList?.Items || [];
  const existing = items.find(
    (d) => d.Comment === "Image to Text webapp" || (d.Origins?.Items || []).some(
      (o) => o.DomainName && o.DomainName.startsWith(bucketName)
    )
  );
  if (existing) {
    console.log("CloudFront distribution exists:", existing.Id, existing.DomainName);
    return { id: existing.Id, domain: existing.DomainName, url: `https://${existing.DomainName}` };
  }
  const s3Origin = `${bucketName}.s3.${region}.amazonaws.com`;
  const dist = await cloudfront.createDistribution({
    DistributionConfig: {
      CallerReference: `webapp-${Date.now()}`,
      Comment: "Image to Text webapp",
      DefaultRootObject: "index.html",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [{
          Id: "S3-origin",
          DomainName: s3Origin,
          S3OriginConfig: { OriginAccessIdentity: "" },
          OriginAccessControlId: oacId,
          CustomHeaders: { Quantity: 0 }
        }]
      },
      DefaultCacheBehavior: {
        TargetOriginId: "S3-origin",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] } },
        Compress: true,
        MinTTL: 0,
        DefaultTTL: 86400,
        MaxTTL: 31536000,
        ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } }
      },
      CustomErrorResponses: {
        Quantity: 2,
        Items: [
          { ErrorCode: 403, ResponseCode: "200", ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
          { ErrorCode: 404, ResponseCode: "200", ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 }
        ]
      },
      PriceClass: "PriceClass_100",
      ViewerCertificate: { CloudFrontDefaultCertificate: true, MinimumProtocolVersion: "TLSv1.2_2021" }
    }
  }).promise();
  const id = dist.Distribution.Id;
  const domain = dist.Distribution.DomainName;
  console.log("CloudFront distribution created:", id, domain);
  return { id, domain, url: `https://${domain}` };
}

function setBucketPolicyForCloudFront(bucketName, distributionArn) {
  const policy = {
    Version: "2012-10-17",
    Statement: [{
      Sid: "AllowCloudFrontServicePrincipal",
      Effect: "Allow",
      Principal: { Service: "cloudfront.amazonaws.com" },
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${bucketName}/*`,
      Condition: { StringEquals: { "AWS:SourceArn": distributionArn } }
    }]
  };
  return s3.putBucketPolicy({ Bucket: bucketName, Policy: JSON.stringify(policy) }).promise();
}

async function uploadDirToS3(bucketName, localDir) {
  const files = getAllFiles(localDir);
  let uploaded = 0;
  for (const rel of files) {
    const fullPath = path.join(localDir, rel);
    const body = fs.readFileSync(fullPath);
    const contentType = getContentType(fullPath);
    const key = rel.split(path.sep).join("/");
    await s3.putObject({ Bucket: bucketName, Key: key, Body: body, ContentType: contentType }).promise();
    uploaded++;
    if (uploaded % 20 === 0) console.log("Uploaded", uploaded, "files...");
  }
  console.log("Uploaded", uploaded, "files to S3");
}

async function invalidateDistribution(distributionId) {
  await cloudfront.createInvalidation({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `webapp-${Date.now()}`,
      Paths: { Quantity: 1, Items: ["/*"] }
    }
  }).promise();
  console.log("CloudFront invalidation created for", distributionId);
}

async function getDistributionArn(distributionId) {
  const data = await cloudfront.getDistribution({ Id: distributionId }).promise();
  const arn = data.Distribution?.ARN;
  if (!arn) throw new Error("Could not get distribution ARN");
  return arn;
}

(async () => {
  try {
    const region = AWS.config.region || "us-east-1";
    const accountId = await getAccountId();
    const bucketName = `${WEBAPP_BUCKET_PREFIX}-${accountId}`;

    if (!fs.existsSync(OUT_DIR)) {
      console.log("Running npm run build...");
      const { execSync } = require("child_process");
      execSync("npm run build", { cwd: __dirname, stdio: "inherit" });
    }
    if (!fs.existsSync(OUT_DIR)) {
      console.error("Build output not found at", OUT_DIR);
      console.error("Ensure next.config has output: 'export' and run npm run build");
      process.exit(1);
    }

    await ensureBucket(bucketName);
    const oacId = await createOAC();
    const dist = await createDistribution(bucketName, oacId, region);
    const distArn = await getDistributionArn(dist.id);
    await setBucketPolicyForCloudFront(bucketName, distArn);
    await uploadDirToS3(bucketName, OUT_DIR);
    await invalidateDistribution(dist.id);

    console.log("\n✅ Webapp deployed (S3 + CloudFront)");
    console.log("   S3 bucket:", bucketName);
    console.log("   CloudFront URL:", dist.url);
    console.log("\n🌐 AWS webapp live link:", dist.url);
    console.log("   (Distribution may take a few minutes to become active. To get the URL later: node get-url.js)");
  } catch (err) {
    console.error("Deploy error:", err);
    process.exit(1);
  }
})();
