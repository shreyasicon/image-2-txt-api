const AWS = require("aws-sdk");
const fs = require("fs");
const archiver = require("archiver");
const path = require("path");
const crypto = require("crypto");

AWS.config.update({ region: "us-east-1" });

const lambda = new AWS.Lambda();
const iam = new AWS.IAM();
const apigatewayv2 = new AWS.ApiGatewayV2();
const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();
const cognito = new AWS.CognitoIdentityServiceProvider();

const FUNCTION_NAME = "ocr-api";
const CONSUMER_FUNCTION_NAME = "ocr-sqs-consumer";
const OCR_QUEUE_NAME = "OCRJobQueue";
const ROLE_NAME = "LambdaOCRExecutionRole";
const CONSUMER_ROLE_NAME = "OCRConsumerExecutionRole";
const API_NAME = "OCR-API";
const S3_BUCKET = "ocr-upload-images-icon-203";
const DYNAMODB_TABLE = "OCRJobs";
const OCR_CACHE_TABLE = "OCRCache";
const USER_S3_LINKS_TABLE = "UserS3Links";
const COGNITO_POOL_NAME = "image2text-user-pool";
const COGNITO_CLIENT_NAME = "image2text-webapp-client";

const LAMBDA_FOLDER = path.join(__dirname, "lambda-code");
const ZIP_FILE = path.join(__dirname, "ocr-api.zip");

const SERVER_FILE = path.join(LAMBDA_FOLDER, "server.js");
const HASH_FILE = path.join(__dirname, ".last_deploy_hash");

if (!fs.existsSync(SERVER_FILE)) {
    console.error("deploy.js must be run from the project root (where the lambda-code folder is).");
    console.error("Current directory:", __dirname);
    console.error("Run: cd .. && node deploy.js");
    process.exit(1);
}

/* ---------- Hash helpers ---------- */
function fileHash(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}

function serverChanged() {
    const currentHash = fileHash(SERVER_FILE);

    if (fs.existsSync(HASH_FILE)) {
        const lastHash = fs.readFileSync(HASH_FILE, "utf8");
        if (currentHash === lastHash) {
            console.log("🟡 server.js unchanged — skipping Lambda update");
            return false;
        }
    }

    fs.writeFileSync(HASH_FILE, currentHash);
    return true;
}

/* ---------- IAM Role ---------- */
async function ensureTextractDynamoDBPolicy(queueArn) {
    const inlinePolicy = {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: ["textract:DetectDocumentText", "textract:DetectDocumentTextAnalysis"],
                Resource: "*"
            },
            {
                Effect: "Allow",
                Action: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:BatchGetItem"
                ],
                Resource: [
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${DYNAMODB_TABLE}`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${DYNAMODB_TABLE}/index/*`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${OCR_CACHE_TABLE}`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${USER_S3_LINKS_TABLE}`
                ]
            },
            ...(queueArn ? [{
                Effect: "Allow",
                Action: ["sqs:SendMessage"],
                Resource: [queueArn]
            }] : [])
        ]
    };

    await iam.putRolePolicy({
        RoleName: ROLE_NAME,
        PolicyName: "OCRTextractDynamoDBPolicy",
        PolicyDocument: JSON.stringify(inlinePolicy)
    }).promise();
    console.log("IAM inline policy OCRTextractDynamoDBPolicy (Textract + DynamoDB) attached");
}

async function createIAMRole(queueArn) {
    try {
        const role = await iam.getRole({ RoleName: ROLE_NAME }).promise();
        console.log(`IAM Role exists: ${ROLE_NAME}`);
        await ensureTextractDynamoDBPolicy(queueArn);
        try {
            await iam.attachRolePolicy({
                RoleName: ROLE_NAME,
                PolicyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess"
            }).promise();
            console.log("S3 policy attached to role");
        } catch (e) {
            if (e.code !== "LimitExceededException" && e.code !== "InvalidInputException") throw e;
        }
        return role.Role.Arn;
    } catch {
        console.log(`Creating IAM Role: ${ROLE_NAME}...`);

        const assumeRolePolicy = JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole"
            }]
        });

        const role = await iam.createRole({
            RoleName: ROLE_NAME,
            AssumeRolePolicyDocument: assumeRolePolicy
        }).promise();

        await iam.attachRolePolicy({
            RoleName: ROLE_NAME,
            PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }).promise();

        await iam.attachRolePolicy({
            RoleName: ROLE_NAME,
            PolicyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        }).promise();

        await ensureTextractDynamoDBPolicy(queueArn);

        console.log("Waiting for IAM role propagation...");
        await new Promise(r => setTimeout(r, 10000));

        return role.Role.Arn;
    }
}

/* ---------- SQS Queue for async OCR (API → SQS → Consumer Lambda) ---------- */
async function ensureOcrQueue() {
    try {
        const result = await sqs.getQueueUrl({ QueueName: OCR_QUEUE_NAME }).promise();
        const url = result.QueueUrl;
        const attr = await sqs.getQueueAttributes({
            QueueUrl: url,
            AttributeNames: ["QueueArn"]
        }).promise();
        const arn = attr.Attributes && attr.Attributes.QueueArn ? attr.Attributes.QueueArn : null;
        console.log(`SQS queue exists: ${OCR_QUEUE_NAME}`);
        return { url, arn };
    } catch (e) {
        if (e.code !== "AWS.SimpleQueueService.NonExistentQueue") throw e;
    }
    const create = await sqs.createQueue({
        QueueName: OCR_QUEUE_NAME,
        Attributes: {
            VisibilityTimeout: "300",
            MessageRetentionPeriod: "86400"
        }
    }).promise();
    const url = create.QueueUrl;
    const attr = await sqs.getQueueAttributes({
        QueueUrl: url,
        AttributeNames: ["QueueArn"]
    }).promise();
    const arn = attr.Attributes && attr.Attributes.QueueArn ? attr.Attributes.QueueArn : null;
    console.log(`SQS queue created: ${OCR_QUEUE_NAME}`);
    return { url, arn };
}

const GSI_NAME = "ByCreatedAt";
const GSI_PK = "gsiPk";
const GSI_SK = "gsiSk";

/* ---------- DynamoDB Table ---------- */
async function createDynamoDBTable() {
    try {
        const desc = await dynamodb.describeTable({ TableName: DYNAMODB_TABLE }).promise();
        console.log(`DynamoDB table exists: ${DYNAMODB_TABLE}`);
        const hasGsi = (desc.Table.GlobalSecondaryIndexes || []).some(g => g.IndexName === GSI_NAME);
        if (!hasGsi) {
            console.log(`Adding GSI ${GSI_NAME} to ${DYNAMODB_TABLE} (query jobs by date)...`);
            await dynamodb.updateTable({
                TableName: DYNAMODB_TABLE,
                AttributeDefinitions: [
                    { AttributeName: GSI_PK, AttributeType: "S" },
                    { AttributeName: GSI_SK, AttributeType: "S" }
                ],
                GlobalSecondaryIndexUpdates: [
                    {
                        Create: {
                            IndexName: GSI_NAME,
                            KeySchema: [
                                { AttributeName: GSI_PK, KeyType: "HASH" },
                                { AttributeName: GSI_SK, KeyType: "RANGE" }
                            ],
                            Projection: { ProjectionType: "ALL" }
                        }
                    }
                ]
            }).promise();
            console.log(`GSI ${GSI_NAME} created; wait for ACTIVE in AWS Console if needed.`);
        }
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            console.log(`Creating DynamoDB table: ${DYNAMODB_TABLE} with GSI ${GSI_NAME}...`);
            await dynamodb.createTable({
                TableName: DYNAMODB_TABLE,
                AttributeDefinitions: [
                    { AttributeName: "jobId", AttributeType: "S" },
                    { AttributeName: GSI_PK, AttributeType: "S" },
                    { AttributeName: GSI_SK, AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "jobId", KeyType: "HASH" }
                ],
                BillingMode: "PAY_PER_REQUEST",
                GlobalSecondaryIndexes: [
                    {
                        IndexName: GSI_NAME,
                        KeySchema: [
                            { AttributeName: GSI_PK, KeyType: "HASH" },
                            { AttributeName: GSI_SK, KeyType: "RANGE" }
                        ],
                        Projection: { ProjectionType: "ALL" }
                    }
                ]
            }).promise();
            console.log(`DynamoDB table created: ${DYNAMODB_TABLE}`);
            console.log("Waiting for table to be active...");
            await dynamodb.waitFor("tableExists", { TableName: DYNAMODB_TABLE }).promise();
        } else {
            throw err;
        }
    }
}

/* ---------- OCR result cache table (DynamoDB) – scalability: avoid re-OCR for same image ---------- */
async function ensureOCRCacheTable() {
    try {
        await dynamodb.describeTable({ TableName: OCR_CACHE_TABLE }).promise();
        console.log(`DynamoDB cache table exists: ${OCR_CACHE_TABLE}`);
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            console.log(`Creating cache table: ${OCR_CACHE_TABLE}...`);
            await dynamodb.createTable({
                TableName: OCR_CACHE_TABLE,
                AttributeDefinitions: [
                    { AttributeName: "contentHash", AttributeType: "S" }
                ],
                KeySchema: [{ AttributeName: "contentHash", KeyType: "HASH" }],
                BillingMode: "PAY_PER_REQUEST",
                StreamSpecification: { StreamEnabled: false }
            }).promise();
            await dynamodb.waitFor("tableExists", { TableName: OCR_CACHE_TABLE }).promise();
            await dynamodb.updateTimeToLive({
                TableName: OCR_CACHE_TABLE,
                TimeToLiveSpecification: { Enabled: true, AttributeName: "ttl" }
            }).promise();
            console.log(`Cache table ${OCR_CACHE_TABLE} created (TTL on ttl attribute).`);
        } else throw err;
    }
}

/* ---------- UserS3Links table: link user (Cognito) to their S3 objects for easy user-details maintenance ---------- */
async function ensureUserS3LinksTable() {
    try {
        await dynamodb.describeTable({ TableName: USER_S3_LINKS_TABLE }).promise();
        console.log(`DynamoDB table exists: ${USER_S3_LINKS_TABLE}`);
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            console.log(`Creating UserS3Links table: ${USER_S3_LINKS_TABLE}...`);
            await dynamodb.createTable({
                TableName: USER_S3_LINKS_TABLE,
                AttributeDefinitions: [
                    { AttributeName: "userId", AttributeType: "S" },
                    { AttributeName: "jobId", AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "userId", KeyType: "HASH" },
                    { AttributeName: "jobId", KeyType: "RANGE" }
                ],
                BillingMode: "PAY_PER_REQUEST"
            }).promise();
            await dynamodb.waitFor("tableExists", { TableName: USER_S3_LINKS_TABLE }).promise();
            console.log(`UserS3Links table created (userId + jobId → s3Key, filename, createdAt).`);
        } else throw err;
    }
}

/* ---------- GSI ByUserId on OCRJobs (list "my jobs") ---------- */
const GSI_BY_USER = "ByUserId";
async function ensureByUserIdGSI() {
    try {
        const desc = await dynamodb.describeTable({ TableName: DYNAMODB_TABLE }).promise();
        const hasByUser = (desc.Table.GlobalSecondaryIndexes || []).some(g => g.IndexName === GSI_BY_USER);
        if (hasByUser) {
            console.log(`GSI ${GSI_BY_USER} exists on ${DYNAMODB_TABLE}`);
            return;
        }
        console.log(`Adding GSI ${GSI_BY_USER} to ${DYNAMODB_TABLE}...`);
        await dynamodb.updateTable({
            TableName: DYNAMODB_TABLE,
            AttributeDefinitions: [
                { AttributeName: "userId", AttributeType: "S" },
                { AttributeName: "createdAt", AttributeType: "S" }
            ],
            GlobalSecondaryIndexUpdates: [{
                Create: {
                    IndexName: GSI_BY_USER,
                    KeySchema: [
                        { AttributeName: "userId", KeyType: "HASH" },
                        { AttributeName: "createdAt", KeyType: "RANGE" }
                    ],
                    Projection: { ProjectionType: "ALL" }
                }
            }]
        }).promise();
        console.log(`GSI ${GSI_BY_USER} created; wait for ACTIVE in AWS Console if needed.`);
    } catch (err) {
        if (err.code === "ResourceInUseException" || (err.message && err.message.includes("already exists"))) {
            console.log(`GSI ${GSI_BY_USER} already present or in progress.`);
        } else throw err;
    }
}

/* ---------- Cognito User Pool (for webapp auth; Lambda verifies JWT) ---------- */
let cachedUserPoolId = null;
let cachedClientId = null;
async function ensureCognitoUserPool() {
    if (cachedUserPoolId && cachedClientId) return { userPoolId: cachedUserPoolId, clientId: cachedClientId };
    const region = AWS.config.region || "us-east-1";
    const list = await cognito.listUserPools({ MaxResults: 60 }).promise();
    const pool = (list.UserPools || []).find(p => p.Name === COGNITO_POOL_NAME);
    let userPoolId;
    if (pool) {
        userPoolId = pool.Id;
        console.log(`Cognito User Pool exists: ${userPoolId}`);
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
        console.log(`Cognito User Pool created: ${userPoolId}`);
    }
    const clients = await cognito.listUserPoolClients({ UserPoolId: userPoolId }).promise();
    let clientId;
    const appClient = (clients.UserPoolClients || []).find(c => c.ClientName === COGNITO_CLIENT_NAME);
    if (appClient) {
        clientId = appClient.ClientId;
        console.log(`Cognito App Client exists: ${clientId}`);
    } else {
        const createClient = await cognito.createUserPoolClient({
            UserPoolId: userPoolId,
            ClientName: COGNITO_CLIENT_NAME,
            GenerateSecret: false,
            ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
        }).promise();
        clientId = createClient.UserPoolClient.ClientId;
        console.log(`Cognito App Client created: ${clientId}`);
    }
    cachedUserPoolId = userPoolId;
    cachedClientId = clientId;
    return { userPoolId, clientId };
}

/* ---------- Zip Lambda ---------- */
function zipLambda() {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(ZIP_FILE);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            console.log(`Zip created: ${ZIP_FILE} (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on("error", reject);
        archive.pipe(output);

        archive.glob("**/*", {
            cwd: LAMBDA_FOLDER,
            ignore: ["uploads/**", ".git/**", ".gitignore"]
        });

        archive.finalize();
    });
}

/* ---------- Lambda env (shared by create and update) ---------- */
function getLambdaEnv(ocrQueueUrl) {
    return {
        S3_BUCKET,
        TABLE_NAME: DYNAMODB_TABLE,
        CACHE_TABLE_NAME: OCR_CACHE_TABLE,
        USER_S3_LINKS_TABLE,
        OCR_QUEUE_URL: ocrQueueUrl || "",
        COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID || "",
        COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID || ""
    };
}

/* ---------- Deploy Lambda ---------- */
async function deployLambda(roleArn, envOverrides = {}, ocrQueueUrl) {
    const zipBuffer = fs.readFileSync(ZIP_FILE);
    const env = { ...getLambdaEnv(ocrQueueUrl), ...envOverrides };

    try {
        await lambda.updateFunctionCode({
            FunctionName: FUNCTION_NAME,
            ZipFile: zipBuffer
        }).promise();

        console.log("Lambda code updated");

        await new Promise(r => setTimeout(r, 60000));

        await lambda.updateFunctionConfiguration({
            FunctionName: FUNCTION_NAME,
            Role: roleArn,
            Handler: "server.handler",
            Runtime: "nodejs20.x",
            Timeout: 30,
            MemorySize: 1024,
            Environment: { Variables: env }
        }).promise();

        console.log("Lambda configuration updated (S3, DynamoDB, Cache, Cognito)");
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            await lambda.createFunction({
                FunctionName: FUNCTION_NAME,
                Runtime: "nodejs20.x",
                Role: roleArn,
                Handler: "server.handler",
                Code: { ZipFile: zipBuffer },
                Timeout: 30,
                MemorySize: 1024,
                Publish: true,
                Environment: { Variables: env }
            }).promise();

            console.log("Lambda function created");
        } else {
            throw err;
        }
    }
}

/* ---------- Update Lambda env only (run when code unchanged) ---------- */
async function updateLambdaEnv(envOverrides = {}, ocrQueueUrl) {
    const env = { ...getLambdaEnv(ocrQueueUrl), ...envOverrides };
    try {
        await lambda.updateFunctionConfiguration({
            FunctionName: FUNCTION_NAME,
            Environment: { Variables: env }
        }).promise();
        console.log("Lambda env updated (S3, DynamoDB, Cache, Cognito)");
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            console.warn("Lambda not found; run deploy again after code change to create it.");
        } else {
            throw err;
        }
    }
}

/* ---------- API Gateway ---------- */
async function createApiGateway() {
    console.log("🔎 Checking API Gateway...");

    const region = AWS.config.region || "us-east-1";
    const apis = await apigatewayv2.getApis().promise();
    let api = apis.Items.find(a => a.Name === API_NAME);

    if (!api) {
        api = await apigatewayv2.createApi({
            Name: API_NAME,
            ProtocolType: "HTTP"
            // No CorsConfiguration: Lambda handles CORS so CloudFront and any origin work
        }).promise();
        console.log("API created (CORS handled by Lambda)");
    } else {
        // Remove API Gateway CORS so OPTIONS and all responses go to Lambda (fixes CloudFront origin)
        try {
            await apigatewayv2.deleteCorsConfiguration({ ApiId: api.ApiId }).promise();
            console.log("API CORS removed; Lambda now handles CORS for CloudFront and all origins");
        } catch (e) {
            if (e.code !== "NotFoundException") {
                console.warn("Could not remove API CORS:", e.message);
            }
        }
    }

    const lambdaData = await lambda.getFunction({ FunctionName: FUNCTION_NAME }).promise();
    const lambdaArn = lambdaData.Configuration.FunctionArn;
    const accountId = lambdaArn.split(":")[4];

    // Required: allow API Gateway to invoke Lambda (otherwise you get 403/502)
    const apiSourceArn = `arn:aws:execute-api:${region}:${accountId}:${api.ApiId}/*`;
    try {
        await lambda.addPermission({
            FunctionName: FUNCTION_NAME,
            StatementId: "apigateway-invoke-" + api.ApiId,
            Action: "lambda:InvokeFunction",
            Principal: "apigateway.amazonaws.com",
            SourceArn: apiSourceArn
        }).promise();
        console.log("✅ Lambda invoke permission granted for API Gateway");
    } catch (e) {
        if (e.code !== "ResourceConflictException") throw e;
    }

    const integrations = await apigatewayv2.getIntegrations({ ApiId: api.ApiId }).promise();
    let integration = integrations.Items.find(i => i.IntegrationType === "AWS_PROXY");

    if (!integration) {
        integration = await apigatewayv2.createIntegration({
            ApiId: api.ApiId,
            IntegrationType: "AWS_PROXY",
            IntegrationUri: lambdaArn,
            PayloadFormatVersion: "2.0"
        }).promise();
    }

    const routes = [
        "GET /health",
        "GET /ready",
        "ANY /ocr",
        "ANY /ocr/base64",
        "ANY /ocr/{jobId}",
        "GET /users/me/s3-links"
    ];

    const existingRoutes = await apigatewayv2.getRoutes({ ApiId: api.ApiId }).promise();
    const routeKeys = existingRoutes.Items.map(r => r.RouteKey);

    for (const routeKey of routes) {
        if (!routeKeys.includes(routeKey)) {
            await apigatewayv2.createRoute({
                ApiId: api.ApiId,
                RouteKey: routeKey,
                Target: `integrations/${integration.IntegrationId}`
            }).promise();
            console.log(`✅ Route created: ${routeKey}`);
        }
    }

    // Create a new deployment so route/API changes go live on prod
    const deployment = await apigatewayv2.createDeployment({ ApiId: api.ApiId }).promise();
    const stages = await apigatewayv2.getStages({ ApiId: api.ApiId }).promise();
    const prodStage = stages.Items.find(s => s.StageName === "prod");

    if (!prodStage) {
        await apigatewayv2.createStage({
            ApiId: api.ApiId,
            DeploymentId: deployment.DeploymentId,
            StageName: "prod",
            AutoDeploy: true
        }).promise();
        console.log("✅ Stage prod created");
    } else if (prodStage.AutoDeploy) {
        // When AutoDeploy is enabled, you cannot set DeploymentId on the stage; deployment is applied automatically
        console.log("✅ Deployment created (prod has AutoDeploy; changes apply automatically)");
    } else {
        await apigatewayv2.updateStage({
            ApiId: api.ApiId,
            StageName: "prod",
            DeploymentId: deployment.DeploymentId
        }).promise();
        console.log("✅ Stage prod updated with new deployment");
    }

    console.log("🌍 API URL:", `${api.ApiEndpoint}/prod`);
}

/* ---------- Consumer Lambda (SQS → OCR processing, DynamoDB cache) ---------- */
const CONSUMER_FOLDER = path.join(__dirname, "consumer");
const CONSUMER_ZIP = path.join(__dirname, "ocr-consumer.zip");

function zipConsumerLambda() {
    return new Promise((resolve, reject) => {
        const os = require("os");
        const { execSync } = require("child_process");
        const buildDir = path.join(os.tmpdir(), `ocr-consumer-build-${Date.now()}`);
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
        fs.copyFileSync(path.join(CONSUMER_FOLDER, "index.js"), path.join(buildDir, "index.js"));
        fs.copyFileSync(path.join(CONSUMER_FOLDER, "package.json"), path.join(buildDir, "package.json"));
        fs.copyFileSync(path.join(LAMBDA_FOLDER, "ocr-process.js"), path.join(buildDir, "ocr-process.js"));
        fs.copyFileSync(path.join(LAMBDA_FOLDER, "ocr-postprocess.js"), path.join(buildDir, "ocr-postprocess.js"));
        execSync("npm install --omit=dev", { cwd: buildDir, stdio: "inherit" });
        const output = fs.createWriteStream(CONSUMER_ZIP);
        const archive = archiver("zip", { zlib: { level: 9 } });
        output.on("close", () => resolve());
        archive.on("error", reject);
        archive.pipe(output);
        archive.directory(buildDir, false);
        archive.finalize();
    });
}

async function ensureConsumerRole() {
    try {
        const role = await iam.getRole({ RoleName: CONSUMER_ROLE_NAME }).promise();
        console.log(`Consumer IAM Role exists: ${CONSUMER_ROLE_NAME}`);
        await iam.attachRolePolicy({
            RoleName: CONSUMER_ROLE_NAME,
            PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
        }).promise().catch(() => {});
        return role.Role.Arn;
    } catch (e) {
        if (e.code !== "NoSuchEntity") throw e;
    }
    const role = await iam.createRole({
        RoleName: CONSUMER_ROLE_NAME,
        AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }]
        })
    }).promise();
    await iam.attachRolePolicy({
        RoleName: CONSUMER_ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    }).promise();
    await iam.attachRolePolicy({
        RoleName: CONSUMER_ROLE_NAME,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
    }).promise();
    await iam.putRolePolicy({
        RoleName: CONSUMER_ROLE_NAME,
        PolicyName: "OCRConsumerPolicy",
        PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                { Effect: "Allow", Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource: "*" },
                { Effect: "Allow", Action: ["s3:GetObject"], Resource: "*" },
                { Effect: "Allow", Action: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"], Resource: [
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${DYNAMODB_TABLE}`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${OCR_CACHE_TABLE}`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${USER_S3_LINKS_TABLE}`
                ]},
                { Effect: "Allow", Action: ["textract:DetectDocumentText"], Resource: "*" }
            ]
        })
    }).promise();
    console.log(`Consumer IAM Role created: ${CONSUMER_ROLE_NAME}`);
    await new Promise(r => setTimeout(r, 5000));
    return role.Role.Arn;
}

async function deployConsumerLambda(consumerRoleArn, queueArn) {
    await zipConsumerLambda();
    const zipBuffer = fs.readFileSync(CONSUMER_ZIP);
    const baseEnv = {
        TABLE_NAME: DYNAMODB_TABLE,
        S3_BUCKET,
        CACHE_TABLE_NAME: OCR_CACHE_TABLE,
        USER_S3_LINKS_TABLE
    };
    let env = { ...baseEnv };
    let vpcConfig = undefined;
    try {
        const current = await lambda.getFunctionConfiguration({ FunctionName: CONSUMER_FUNCTION_NAME }).promise();
        const currentEnv = (current.Environment && current.Environment.Variables) || {};
        if (currentEnv.REDIS_URL) {
            env.REDIS_URL = currentEnv.REDIS_URL;
        }
        if (current.VpcConfig && current.VpcConfig.SubnetIds && current.VpcConfig.SubnetIds.length) {
            vpcConfig = {
                SubnetIds: current.VpcConfig.SubnetIds,
                SecurityGroupIds: current.VpcConfig.SecurityGroupIds || []
            };
        }
    } catch (_) {}
    try {
        await lambda.updateFunctionCode({
            FunctionName: CONSUMER_FUNCTION_NAME,
            ZipFile: zipBuffer
        }).promise();
        const updatePayload = {
            FunctionName: CONSUMER_FUNCTION_NAME,
            Role: consumerRoleArn,
            Handler: "index.handler",
            Runtime: "nodejs20.x",
            Timeout: 300,
            MemorySize: 1024,
            Environment: { Variables: env }
        };
        if (vpcConfig) updatePayload.VpcConfig = vpcConfig;
        await lambda.updateFunctionConfiguration(updatePayload).promise();
        console.log("✅ Consumer Lambda updated" + (env.REDIS_URL ? " (Redis cache preserved)" : ""));
    } catch (e) {
        if (e.code === "ResourceNotFoundException") {
            await lambda.createFunction({
                FunctionName: CONSUMER_FUNCTION_NAME,
                Runtime: "nodejs20.x",
                Role: consumerRoleArn,
                Handler: "index.handler",
                Code: { ZipFile: zipBuffer },
                Timeout: 300,
                MemorySize: 1024,
                Environment: { Variables: env }
            }).promise();
            console.log("✅ Consumer Lambda created");
        } else throw e;
    }
    try {
        await lambda.createEventSourceMapping({
            EventSourceArn: queueArn,
            FunctionName: CONSUMER_FUNCTION_NAME,
            BatchSize: 1
        }).promise();
        console.log("✅ SQS → Consumer event source mapping created");
    } catch (e) {
        if (e.code === "ResourceConflictException") {
            console.log("SQS event source already attached to consumer");
        } else throw e;
    }
}

/* ---------- Main ---------- */
(async () => {
    try {
        console.log("📦 Ensuring DynamoDB tables, GSI, cache, UserS3Links, Cognito, SQS, IAM...");
        await createDynamoDBTable();
        await ensureOCRCacheTable();
        await ensureUserS3LinksTable();
        await ensureByUserIdGSI();
        const { userPoolId, clientId } = await ensureCognitoUserPool();
        const { url: ocrQueueUrl, arn: queueArn } = await ensureOcrQueue();
        const roleArn = await createIAMRole(queueArn);

        const envOverrides = {
            COGNITO_USER_POOL_ID: userPoolId,
            COGNITO_CLIENT_ID: clientId
        };

        if (serverChanged()) {
            await zipLambda();
            await deployLambda(roleArn, envOverrides, ocrQueueUrl);
            console.log("✅ Lambda updated");
        } else {
            await updateLambdaEnv(envOverrides, ocrQueueUrl);
            console.log("✅ Lambda code unchanged; env refreshed");
        }

        const consumerRoleArn = await ensureConsumerRole();
        await deployConsumerLambda(consumerRoleArn, queueArn);

        await createApiGateway();
        console.log("🚀 Deployment finished");
        console.log("   SQS queue (async OCR):", OCR_QUEUE_NAME, ocrQueueUrl || "(url above)");
        console.log("   Cognito User Pool ID (for webapp):", userPoolId);
        console.log("   Cognito Client ID (for webapp):", clientId);
    } catch (err) {
        console.error("Deployment error:", err);
    }
})();