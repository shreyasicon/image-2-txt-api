/**
 * Deploy webapp to AWS: build + S3 upload, then either CloudFront or Lambda + API Gateway.
 *   node deploy.js              -> S3 + CloudFront (default)
 *   DEPLOY_TARGET=lambda node deploy.js  -> S3 + Lambda + API Gateway HTTP API (scalable)
 * Prereqs: AWS credentials configured (e.g. aws configure).
 */
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");
const sts = new AWS.STS();

AWS.config.update({ region: "us-east-1" });

const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();
const cognito = new AWS.CognitoIdentityServiceProvider();
const lambda = new AWS.Lambda();
const apigw = new AWS.ApiGatewayV2();
const iam = new AWS.IAM();

const WEBAPP_BUCKET_PREFIX = "image2text-webapp";
const OUT_DIR = path.join(__dirname, "out");
const LAMBDA_DIR = path.join(__dirname, "lambda-webapp-serve");
const COGNITO_POOL_NAME = "image2text-user-pool";
const COGNITO_CLIENT_NAME = "image2text-webapp-client";
const REWRITE_FUNCTION_NAME = "webapp-nextjs-rewrite";
const LAMBDA_FUNCTION_NAME = "webapp-serve";
const API_NAME = "webapp-api";
const LAMBDA_ROLE_NAME = "webapp-serve-lambda-role";

/** CloudFront Function: rewrite request URI so Next.js static export routes work (e.g. /dashboard/upload -> /dashboard/upload.html). */
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

/** Create or reuse Cognito User Pool + App Client; link to webapp via build-time env. */
async function ensureCognitoUserPool() {
  const list = await cognito.listUserPools({ MaxResults: 60 }).promise();
  const pool = (list.UserPools || []).find((p) => p.Name === COGNITO_POOL_NAME);
  let userPoolId;
  if (pool) {
    userPoolId = pool.Id;
    console.log("Cognito User Pool exists:", userPoolId);
  } else {
    const create = await cognito.createUserPool({
      PoolName: COGNITO_POOL_NAME,
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: false,
          RequireLowercase: false,
          RequireNumbers: false,
          RequireSymbols: false
        }
      },
      AutoVerifiedAttributes: ["email"],
      Schema: [
        { Name: "email", AttributeDataType: "String", Required: true, Mutable: true },
        { Name: "name", AttributeDataType: "String", Required: false, Mutable: true }
      ],
      UsernameAttributes: ["email"],
      MfaConfiguration: "OFF"
    }).promise();
    userPoolId = create.UserPool.Id;
    console.log("Cognito User Pool created:", userPoolId);
  }
  const clients = await cognito.listUserPoolClients({ UserPoolId: userPoolId }).promise();
  let clientId;
  const appClient = (clients.UserPoolClients || []).find((c) => c.ClientName === COGNITO_CLIENT_NAME);
  if (appClient) {
    clientId = appClient.ClientId;
    console.log("Cognito App Client exists:", clientId);
  } else {
    const createClient = await cognito.createUserPoolClient({
      UserPoolId: userPoolId,
      ClientName: COGNITO_CLIENT_NAME,
      GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
    }).promise();
    clientId = createClient.UserPoolClient.ClientId;
    console.log("Cognito App Client created:", clientId);
  }
  return { userPoolId, clientId };
}

/** Create or update and publish CloudFront Function for Next.js route rewrite; returns function ARN. */
async function ensureRewriteFunction(accountId) {
  var functionArn = "arn:aws:cloudfront::" + accountId + ":function/" + REWRITE_FUNCTION_NAME;
  try {
    var existing = await cloudfront.describeFunction({ Name: REWRITE_FUNCTION_NAME }).promise();
    var etag = existing.ETag;
    var updateRes = await cloudfront.updateFunction({
      Name: REWRITE_FUNCTION_NAME,
      IfMatch: etag,
      FunctionConfig: { Comment: "Next.js static export route rewrite (/path -> /path.html)", Runtime: "cloudfront-js-1.0" },
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
    const createdId = created.OriginAccessControl?.Id;
    console.log("Origin Access Control created:", createdId);
    return createdId;
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

/** Scalability: security headers at edge (HSTS, X-Content-Type-Options, etc.) */
const RESPONSE_HEADERS_POLICY_NAME = "webapp-security-headers";
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
      Comment: "Security headers for webapp (scalable edge config)",
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

/** Scalability: cache behavior for static assets (long TTL, less origin load) */
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

/** Find distribution that uses this exact S3 bucket as origin (so we never update the wrong one). */
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
  /* Default behavior: no long cache so HTML/app updates are visible after deploy + invalidation */
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
  if (rewriteFunctionArn) {
    defaultBehavior.FunctionAssociations = {
      Quantity: 1,
      Items: [{ EventType: "viewer-request", FunctionARN: rewriteFunctionArn }]
    };
  }
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
        ? {
            Quantity: 1,
            Items: [staticCacheBehavior("S3-origin", responseHeadersPolicyId)]
          }
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

/** Ensure cache behaviors have required fields for UpdateDistribution API (e.g. SmoothStreaming). Strip inline ResponseHeadersPolicy to avoid "Header settings is required". */
function normalizeCacheBehaviorsForUpdate(config) {
  if (config.DefaultCacheBehavior && config.DefaultCacheBehavior.SmoothStreaming === undefined) {
    config.DefaultCacheBehavior.SmoothStreaming = false;
  }
  const items = config.CacheBehaviors?.Items || [];
  items.forEach((b) => {
    if (b.SmoothStreaming === undefined) b.SmoothStreaming = false;
  });
  if (config.DefaultCacheBehavior && config.DefaultCacheBehavior.ResponseHeadersPolicy) {
    delete config.DefaultCacheBehavior.ResponseHeadersPolicy;
  }
  items.forEach((b) => {
    if (b.ResponseHeadersPolicy) delete b.ResponseHeadersPolicy;
  });
}

/** Update existing distribution: TTL=0, attach rewrite function for routing, normalize for API. */
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
    if (rewriteFunctionArn && (!def.FunctionAssociations || !def.FunctionAssociations.Items || !def.FunctionAssociations.Items.some(function (a) { return a.EventType === "viewer-request"; }))) {
      def.FunctionAssociations = def.FunctionAssociations || { Quantity: 0, Items: [] };
      def.FunctionAssociations.Items = def.FunctionAssociations.Items || [];
      def.FunctionAssociations.Items.push({ EventType: "viewer-request", FunctionARN: rewriteFunctionArn });
      def.FunctionAssociations.Quantity = def.FunctionAssociations.Items.length;
      updated = true;
    }
  }
  normalizeCacheBehaviorsForUpdate(config);
  if (!updated) {
    console.log("Distribution already has correct config; normalized for API.");
  }
  await cloudfront.updateDistribution({
    Id: distributionId,
    DistributionConfig: config,
    IfMatch: etag
  }).promise();
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

async function uploadDirToS3(bucketName, localDir) {
  const files = getAllFiles(localDir);
  let uploaded = 0;
  for (const rel of files) {
    const fullPath = path.join(localDir, rel);
    const body = fs.readFileSync(fullPath);
    const contentType = getContentType(fullPath);
    const key = rel.split(path.sep).join("/");
    const isHtml = /\.(html?|htm)$/i.test(rel);
    const isStaticAsset = /\/_next\/static\//.test(rel) || /\.(js|css|woff2?|ico|svg)$/i.test(rel);
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType
    };
    if (isHtml) {
      params.CacheControl = "max-age=0, no-cache, no-store, must-revalidate";
    } else if (isStaticAsset) {
      params.CacheControl = "public, max-age=31536000, immutable";
    }
    await s3.putObject(params).promise();
    uploaded++;
    if (uploaded % 20 === 0) console.log("Uploaded", uploaded, "files...");
  }
  console.log("Uploaded", uploaded, "files to S3");
}

async function invalidateDistribution(distributionId) {
  const paths = ["/*", "/", "/index.html"];
  const result = await cloudfront.createInvalidation({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `webapp-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths }
    }
  }).promise();
  const invalidationId = result.Invalidation?.Id;
  console.log("CloudFront invalidation created for", distributionId, "(id:", invalidationId + ", paths: " + paths.join(", ") + ")");
  return invalidationId;
}

/** Wait for invalidation to complete so the next request gets fresh content from S3. */
async function waitForInvalidation(distributionId, invalidationId, maxWaitMs = 300000) {
  if (!invalidationId) return;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const getRes = await cloudfront.getInvalidation({
      DistributionId: distributionId,
      Id: invalidationId
    }).promise();
    const status = getRes.Invalidation?.Status;
    if (status === "Completed") {
      console.log("   Invalidation completed; cache cleared.");
      return;
    }
    if (status === "Failed") {
      console.warn("   Invalidation reported Failed; cache may still be clearing.");
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.warn("   Invalidation wait timed out; cache may still be clearing (try in 1–2 min).");
}

async function getDistributionArn(distributionId) {
  const data = await cloudfront.getDistribution({ Id: distributionId }).promise();
  const arn = data.Distribution?.ARN;
  if (!arn) throw new Error("Could not get distribution ARN");
  return arn;
}

/** Wait for CloudFront distribution config update to deploy (so new TTL/cache is active before we invalidate). */
async function waitForDistributionDeployed(distributionId, maxWaitMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const data = await cloudfront.getDistribution({ Id: distributionId }).promise();
    const status = data.Distribution?.Status;
    if (status === "Deployed") {
      console.log("   Distribution is Deployed; cache config is live.");
      return;
    }
    console.log("   Waiting for distribution to deploy (status:", status + ")...");
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error("Timed out waiting for distribution to deploy");
}

// ---------- Lambda + API Gateway (scalable hosting) ----------
function zipLambdaDir() {
  execSync("npm install --omit=dev", { cwd: LAMBDA_DIR, stdio: "inherit" });
  const zipPath = path.join(__dirname, "lambda-webapp-serve.zip");
  const out = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    out.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(LAMBDA_DIR, false);
    archive.finalize();
  });
}

async function ensureLambdaRole(accountId, bucketName) {
  const roleName = LAMBDA_ROLE_NAME;
  const assumePolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  let roleArn;
  try {
    const existing = await iam.getRole({ RoleName: roleName }).promise();
    roleArn = existing.Role.Arn;
    console.log("Lambda execution role exists:", roleArn);
  } catch (e) {
    if (e.code !== "NoSuchEntity") throw e;
    const create = await iam.createRole({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumePolicy,
      Description: "Execution role for webapp-serve Lambda"
    }).promise();
    roleArn = create.Role.Arn;
    console.log("Lambda execution role created:", roleArn);
    await iam.attachRolePolicy({
      RoleName: roleName,
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    }).promise();
  }
  const s3PolicyName = "webapp-serve-s3-read";
  const s3PolicyDoc = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucketName}/*`] }]
  });
  try {
    const list = await iam.listRolePolicies({ RoleName: roleName }).promise();
    if ((list.PolicyNames || []).includes(s3PolicyName)) {
      await iam.putRolePolicy({ RoleName: roleName, PolicyName: s3PolicyName, PolicyDocument: s3PolicyDoc }).promise();
    } else {
      await iam.putRolePolicy({ RoleName: roleName, PolicyName: s3PolicyName, PolicyDocument: s3PolicyDoc }).promise();
    }
  } catch (_) {
    await iam.putRolePolicy({ RoleName: roleName, PolicyName: s3PolicyName, PolicyDocument: s3PolicyDoc }).promise();
  }
  return roleArn;
}

async function ensureLambdaWebappServe(bucketName, region, roleArn) {
  const zipPath = await zipLambdaDir();
  const zipBuffer = fs.readFileSync(zipPath);
  const functionName = LAMBDA_FUNCTION_NAME;
  try {
    const existing = await lambda.getFunction({ FunctionName: functionName }).promise();
    await lambda.updateFunctionCode({
      FunctionName: functionName,
      ZipFile: zipBuffer
    }).promise();
    await lambda.updateFunctionConfiguration({
      FunctionName: functionName,
      Environment: { Variables: { BUCKET: bucketName } },
      Timeout: 30,
      MemorySize: 256
    }).promise();
    console.log("Lambda function updated:", functionName);
    return existing.Configuration.FunctionArn;
  } catch (e) {
    if (e.code !== "ResourceNotFoundException") throw e;
    const create = await lambda.createFunction({
      FunctionName: functionName,
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: { BUCKET: bucketName } }
    }).promise();
    console.log("Lambda function created:", functionName);
    return create.FunctionArn;
  } finally {
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }
}

async function ensureApiGatewayHttpApi(lambdaArn, accountId, region) {
  const list = await apigw.getApis({}).promise();
  const existing = (list.Items || []).find((a) => a.Name === API_NAME);
  let apiId;
  if (existing) {
    apiId = existing.ApiId;
    console.log("API Gateway HTTP API exists:", apiId);
  } else {
    const create = await apigw.createApi({
      Name: API_NAME,
      ProtocolType: "HTTP",
      Description: "Webapp static site (Lambda)"
    }).promise();
    apiId = create.ApiId;
    console.log("API Gateway HTTP API created:", apiId);
  }
  const integrations = await apigw.getIntegrations({ ApiId: apiId }).promise();
  const defaultIntegration = (integrations.Items || []).find((i) => i.IntegrationUri === lambdaArn);
  let integrationId;
  if (defaultIntegration) {
    integrationId = defaultIntegration.IntegrationId;
  } else {
    const createInt = await apigw.createIntegration({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: lambdaArn,
      PayloadFormatVersion: "2.0"
    }).promise();
    integrationId = createInt.IntegrationId;
  }
  const routes = await apigw.getRoutes({ ApiId: apiId }).promise();
  const defaultRoute = (routes.Items || []).find((r) => r.RouteKey === "$default");
  if (!defaultRoute) {
    await apigw.createRoute({
      ApiId: apiId,
      RouteKey: "$default",
      Target: "integrations/" + integrationId
    }).promise();
    console.log("Created $default route -> Lambda");
  }
  let stage = (await apigw.getStages({ ApiId: apiId }).promise()).Items?.find((s) => s.StageName === "$default");
  if (!stage) {
    await apigw.createStage({
      ApiId: apiId,
      StageName: "$default",
      AutoDeploy: true
    }).promise();
    stage = { StageName: "$default" };
  }
  const invokeArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`;
  try {
    await lambda.addPermission({
      FunctionName: LAMBDA_FUNCTION_NAME,
      StatementId: "apigw-invoke-" + apiId,
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn: invokeArn
    }).promise();
  } catch (e) {
    if (e.code !== "ResourceConflictException") throw e;
  }
  const baseUrl = `https://${apiId}.execute-api.${region}.amazonaws.com/${stage.StageName}`;
  return { apiId, baseUrl };
}

(async () => {
  try {
    const region = AWS.config.region || "us-east-1";
    const accountId = await getAccountId();
    const bucketName = `${WEBAPP_BUCKET_PREFIX}-${accountId}`;
    const useLambda = process.env.DEPLOY_TARGET === "lambda";

    console.log("Ensuring Cognito User Pool (for Sign in / My Uploads)...");
    const { userPoolId, clientId } = await ensureCognitoUserPool();

    console.log("Building latest version (npm run build) with Cognito env...");
    const buildEnv = {
      ...process.env,
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPoolId,
      NEXT_PUBLIC_COGNITO_CLIENT_ID: clientId,
      NEXT_PUBLIC_AWS_REGION: region
    };
    execSync("npm run build", { cwd: __dirname, stdio: "inherit", env: buildEnv });
    if (!fs.existsSync(OUT_DIR)) {
      console.error("Build output not found at", OUT_DIR);
      console.error("Ensure next.config has output: 'export'");
      process.exit(1);
    }

    await ensureBucket(bucketName);
    console.log("Uploading build to S3...");
    await uploadDirToS3(bucketName, OUT_DIR);
    const head = await s3.headObject({ Bucket: bucketName, Key: "index.html" }).promise().catch(() => null);
    if (head) {
      console.log("   Verified: index.html in S3, LastModified:", head.LastModified);
    } else {
      console.warn("   Warning: index.html not found in S3 after upload; check build output.");
    }

    if (useLambda) {
      console.log("Deploying Lambda + API Gateway (scalable hosting)...");
      const roleArn = await ensureLambdaRole(accountId, bucketName);
      const lambdaArn = await ensureLambdaWebappServe(bucketName, region, roleArn);
      const { baseUrl } = await ensureApiGatewayHttpApi(lambdaArn, accountId, region);
      console.log("\n✅ Webapp deployed (S3 + Lambda + API Gateway)");
      console.log("   S3 bucket:", bucketName);
      console.log("   Lambda:", LAMBDA_FUNCTION_NAME);
      console.log("   Cognito User Pool:", userPoolId);
      console.log("   Cognito Client ID:", clientId);
      console.log("\n🌐 AWS webapp live link (Lambda):", baseUrl);
      console.log("   (Use this URL as your app URL; no CloudFront.)");
    } else {
      const oacId = await createOAC();
      const responseHeadersPolicyId = await ensureResponseHeadersPolicy();
      console.log("Ensuring CloudFront rewrite function (for /dashboard/upload etc. routing)...");
      const rewriteFunctionArn = await ensureRewriteFunction(accountId);
      const dist = await createDistribution(bucketName, oacId, region, responseHeadersPolicyId, rewriteFunctionArn);
      const distArn = await getDistributionArn(dist.id);
      await setBucketPolicyForCloudFront(bucketName, distArn);
      if (!dist.created) {
        await updateDistributionWithScalability(dist.id, rewriteFunctionArn);
      }
      console.log("Waiting for CloudFront distribution to be Deployed...");
      await waitForDistributionDeployed(dist.id);
      console.log("Creating CloudFront invalidation (and waiting for it)...");
      const invalidationId = await invalidateDistribution(dist.id);
      await waitForInvalidation(dist.id, invalidationId);
      console.log("\n✅ Webapp deployed (S3 + CloudFront + Cognito linked)");
      console.log("   S3 bucket:", bucketName);
      console.log("   CloudFront URL:", dist.url);
      console.log("   Cognito User Pool:", userPoolId);
      console.log("   Cognito Client ID:", clientId);
      console.log("\n🌐 AWS webapp live link:", dist.url);
      console.log("   (If you still see old content, hard-refresh: Ctrl+Shift+R or use an incognito window.)");
    }
  } catch (err) {
    console.error("Deploy error:", err);
    process.exit(1);
  }
})();
