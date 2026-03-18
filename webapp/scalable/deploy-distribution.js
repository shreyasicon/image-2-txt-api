/**
 * Ensure CloudFront distribution uses the latest S3 bucket (image2text-webapp-<accountId>)
 * and is running. No build or upload – distribution only. Run: node deploy-distribution.js
 * Prereqs: AWS credentials configured. S3 bucket must already exist (run deploy.js once if needed).
 */
const AWS = require("aws-sdk");
const sts = new AWS.STS();
const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();

AWS.config.update({ region: "us-east-1" });

const WEBAPP_BUCKET_PREFIX = "image2text-webapp";
const RESPONSE_HEADERS_POLICY_NAME = "webapp-security-headers";
const REWRITE_FUNCTION_NAME = "webapp-nextjs-rewrite";

const REWRITE_FUNCTION_CODE = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (!uri || uri === '/') {
    request.uri = '/index.html';
    return request;
  }
  var normalized = uri.replace(/\\/$/, '');
  var lastSegment = normalized.split('/').pop() || '';
  if (lastSegment.indexOf('.') === -1) {
    request.uri = normalized + '.html';
  }
  return request;
}
`.trim();

async function getAccountId() {
  const data = await sts.getCallerIdentity().promise();
  return data.Account;
}

async function createOAC() {
  const list = await cloudfront.listOriginAccessControls({ MaxItems: "100" }).promise();
  const items = list.OriginAccessControlList?.Items || [];
  const existing = items.find(
    (o) => (o.Name && o.Name === "webapp-oac") || (o.OriginAccessControl && o.OriginAccessControl.Name === "webapp-oac")
  );
  const id = existing ? (existing.Id || existing.OriginAccessControl?.Id) : null;
  if (id) {
    console.log("Origin Access Control exists:", id);
    return id;
  }
  try {
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
  } catch (err) {
    if (err.code === "OriginAccessControlAlreadyExists" || err.statusCode === 409) {
      const retry = (await cloudfront.listOriginAccessControls({ MaxItems: "100" }).promise()).OriginAccessControlList?.Items || [];
      const found = retry.find((o) => (o.Name && o.Name === "webapp-oac") || (o.OriginAccessControl && o.OriginAccessControl.Name === "webapp-oac"));
      const foundId = found ? (found.Id || found.OriginAccessControl?.Id) : null;
      if (foundId) {
        console.log("Origin Access Control already exists (using existing):", foundId);
        return foundId;
      }
    }
    throw err;
  }
}

async function ensureResponseHeadersPolicy() {
  const list = await cloudfront.listResponseHeadersPolicies({ Type: "custom" }).promise();
  const items = list.ResponseHeadersPolicyList?.Items || [];
  const existing = items.find(
    (p) => p.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name === RESPONSE_HEADERS_POLICY_NAME
  );
  if (existing && existing.ResponseHeadersPolicy?.Id) {
    console.log("Response Headers Policy exists:", existing.ResponseHeadersPolicy.Id);
    return existing.ResponseHeadersPolicy.Id;
  }
  const created = await cloudfront.createResponseHeadersPolicy({
    ResponseHeadersPolicyConfig: {
      Name: RESPONSE_HEADERS_POLICY_NAME,
      Comment: "Security headers for webapp",
      SecurityHeadersConfig: {
        StrictTransportSecurity: {
          Override: true,
          AccessControlMaxAgeSec: 63072000,
          IncludeSubdomains: true,
          Preload: true
        },
        ContentTypeOptions: { Override: true },
        FrameOptions: { Override: true, FrameOption: "DENY" },
        ReferrerPolicy: { Override: true, ReferrerPolicy: "strict-origin-when-cross-origin" },
        XSSProtection: { Override: true, Protection: true, ModeBlock: true }
      }
    }
  }).promise();
  const id = created.ResponseHeadersPolicy?.Id;
  if (!id) throw new Error("Failed to get ResponseHeadersPolicy Id");
  console.log("Response Headers Policy created:", id);
  return id;
}

async function ensureRewriteFunction(accountId) {
  var functionArn = "arn:aws:cloudfront::" + accountId + ":function/" + REWRITE_FUNCTION_NAME;
  try {
    var existing = await cloudfront.describeFunction({ Name: REWRITE_FUNCTION_NAME }).promise();
    var updateRes = await cloudfront.updateFunction({
      Name: REWRITE_FUNCTION_NAME,
      IfMatch: existing.ETag,
      FunctionConfig: { Comment: "Next.js static export route rewrite", Runtime: "cloudfront-js-1.0" },
      FunctionCode: REWRITE_FUNCTION_CODE
    }).promise();
    await cloudfront.publishFunction({ Name: REWRITE_FUNCTION_NAME, IfMatch: updateRes.ETag }).promise();
    console.log("Rewrite function updated and published:", REWRITE_FUNCTION_NAME);
    return functionArn;
  } catch (e) {
    if (e.code === "NoSuchFunction" || e.name === "NoSuchFunction" || (e.statusCode && e.statusCode === 404)) {
      var created = await cloudfront.createFunction({
        Name: REWRITE_FUNCTION_NAME,
        FunctionConfig: { Comment: "Next.js static export route rewrite", Runtime: "cloudfront-js-1.0" },
        FunctionCode: REWRITE_FUNCTION_CODE
      }).promise();
      await cloudfront.publishFunction({ Name: REWRITE_FUNCTION_NAME, IfMatch: created.ETag }).promise();
      console.log("Rewrite function created and published:", REWRITE_FUNCTION_NAME);
      return functionArn;
    }
    throw e;
  }
}

function staticCacheBehavior(targetOriginId, responseHeadersPolicyId) {
  return {
    PathPattern: "/_next/static/*",
    TargetOriginId: targetOriginId,
    ViewerProtocolPolicy: "redirect-to-https",
    AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] } },
    Compress: true,
    SmoothStreaming: false,
    MinTTL: 86400,
    DefaultTTL: 31536000,
    MaxTTL: 31536000,
    ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } },
    ResponseHeadersPolicyId: responseHeadersPolicyId
  };
}

function findDistributionForBucket(bucketName, region) {
  const s3Origin = `${bucketName}.s3.${region}.amazonaws.com`;
  return (d) => {
    const origins = d.Origins?.Items || [];
    return origins.some((o) => o.DomainName === s3Origin);
  };
}

async function createDistribution(bucketName, oacId, region, responseHeadersPolicyId, rewriteFunctionArn) {
  const list = await cloudfront.listDistributions({ MaxItems: "100" }).promise();
  const items = list.DistributionList?.Items || [];
  const s3Origin = `${bucketName}.s3.${region}.amazonaws.com`;
  const existing = items.find(findDistributionForBucket(bucketName, region));
  if (existing) {
    console.log("CloudFront distribution exists (origin = this bucket):", existing.Id, existing.DomainName);
    return { id: existing.Id, domain: existing.DomainName, url: `https://${existing.DomainName}`, created: false };
  }
  const defaultBehavior = {
    TargetOriginId: "S3-origin",
    ViewerProtocolPolicy: "redirect-to-https",
    AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] } },
    Compress: true,
    SmoothStreaming: false,
    MinTTL: 0,
    DefaultTTL: 0,
    MaxTTL: 0,
    ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } }
  };
  if (responseHeadersPolicyId) defaultBehavior.ResponseHeadersPolicyId = responseHeadersPolicyId;
  if (rewriteFunctionArn) defaultBehavior.FunctionAssociations = { Quantity: 1, Items: [{ EventType: "viewer-request", FunctionARN: rewriteFunctionArn }] };
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
      DefaultCacheBehavior: defaultBehavior,
      CacheBehaviors: responseHeadersPolicyId
        ? { Quantity: 1, Items: [staticCacheBehavior("S3-origin", responseHeadersPolicyId)] }
        : { Quantity: 0, Items: [] },
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
  return { id, domain, url: `https://${domain}`, created: true };
}

function normalizeCacheBehaviorsForUpdate(config) {
  /** Ensure SmoothStreaming is set (required by UpdateDistribution). */
  if (config.DefaultCacheBehavior && config.DefaultCacheBehavior.SmoothStreaming === undefined) {
    config.DefaultCacheBehavior.SmoothStreaming = false;
  }
  (config.CacheBehaviors?.Items || []).forEach((b) => {
    if (b.SmoothStreaming === undefined) b.SmoothStreaming = false;
  });
  /** Strip inline ResponseHeadersPolicy object so API gets only ResponseHeadersPolicyId (avoids "Header settings is required"). */
  if (config.DefaultCacheBehavior && config.DefaultCacheBehavior.ResponseHeadersPolicy) {
    delete config.DefaultCacheBehavior.ResponseHeadersPolicy;
  }
  (config.CacheBehaviors?.Items || []).forEach((b) => {
    if (b.ResponseHeadersPolicy) delete b.ResponseHeadersPolicy;
  });
}

/** Update existing distribution: TTL=0, attach rewrite function for routing, normalize. */
async function updateDistributionWithScalability(distributionId, rewriteFunctionArn) {
  const getRes = await cloudfront.getDistributionConfig({ Id: distributionId }).promise();
  const config = getRes.DistributionConfig;
  const etag = getRes.ETag;
  let updated = false;
  const def = config.DefaultCacheBehavior;
  if (def) {
    if (def.DefaultTTL !== 0 || def.MaxTTL !== 0) {
      def.MinTTL = 0;
      def.DefaultTTL = 0;
      def.MaxTTL = 0;
      updated = true;
    }
    if (rewriteFunctionArn && (!def.FunctionAssociations || !def.FunctionAssociations.Items || !def.FunctionAssociations.Items.some((a) => a.EventType === "viewer-request"))) {
      def.FunctionAssociations = def.FunctionAssociations || { Quantity: 0, Items: [] };
      def.FunctionAssociations.Items = def.FunctionAssociations.Items || [];
      def.FunctionAssociations.Items.push({ EventType: "viewer-request", FunctionARN: rewriteFunctionArn });
      def.FunctionAssociations.Quantity = def.FunctionAssociations.Items.length;
      updated = true;
    }
  }
  normalizeCacheBehaviorsForUpdate(config);
  if (!updated) console.log("Distribution already has correct config; normalized for API.");
  await cloudfront.updateDistribution({ Id: distributionId, DistributionConfig: config, IfMatch: etag }).promise();
  console.log("Distribution updated (TTL=0, route rewrite for Next.js pages).");
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

async function getDistributionArn(distributionId) {
  const data = await cloudfront.getDistribution({ Id: distributionId }).promise();
  const arn = data.Distribution?.ARN;
  if (!arn) throw new Error("Could not get distribution ARN");
  return arn;
}

async function waitForDistributionDeployed(distributionId, maxWaitMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const data = await cloudfront.getDistribution({ Id: distributionId }).promise();
    const status = data.Distribution?.Status;
    if (status === "Deployed") {
      console.log("   Distribution is Deployed and running.");
      return;
    }
    console.log("   Waiting for distribution to deploy (status:", status + ")...");
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error("Timed out waiting for distribution to deploy");
}

async function invalidateDistribution(distributionId) {
  const result = await cloudfront.createInvalidation({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `webapp-${Date.now()}`,
      Paths: { Quantity: 1, Items: ["/*"] }
    }
  }).promise();
  console.log("   Invalidation created:", result.Invalidation?.Id);
}

(async () => {
  try {
    const region = AWS.config.region || "us-east-1";
    const accountId = await getAccountId();
    const bucketName = `${WEBAPP_BUCKET_PREFIX}-${accountId}`;

    console.log("S3 bucket (latest):", bucketName);
    await s3.headBucket({ Bucket: bucketName }).promise().catch((e) => {
      if (e.code === "NotFound" || e.statusCode === 404) {
        throw new Error("S3 bucket " + bucketName + " does not exist. Run deploy.js once to create it and upload the app.");
      }
      throw e;
    });

    console.log("Ensuring OAC, response headers policy, and rewrite function...");
    const oacId = await createOAC();
    const responseHeadersPolicyId = await ensureResponseHeadersPolicy();
    const rewriteFunctionArn = await ensureRewriteFunction(accountId);

    console.log("Ensuring CloudFront distribution (uses latest S3)...");
    const dist = await createDistribution(bucketName, oacId, region, responseHeadersPolicyId, rewriteFunctionArn);
    const distArn = await getDistributionArn(dist.id);
    await setBucketPolicyForCloudFront(bucketName, distArn);

    if (!dist.created) {
      await updateDistributionWithScalability(dist.id, rewriteFunctionArn);
    }
    console.log("Waiting for distribution to be Deployed...");
    await waitForDistributionDeployed(dist.id);

    console.log("Creating invalidation so latest S3 content is served...");
    await invalidateDistribution(dist.id);

    console.log("\n✅ Distribution is using latest S3 and running");
    console.log("   S3 bucket:", bucketName);
    console.log("   CloudFront URL:", dist.url);
    console.log("\n🌐 Live link:", dist.url);
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
