/**
 * Optional: Create Amazon ElastiCache (Redis) for OCR result caching.
 *
 * The webapp (browser) cannot connect to ElastiCache directly — it's in your VPC.
 * Caching that benefits the webapp is:
 *   1. Client-side: sessionStorage in the browser (already in the webapp).
 *   2. Backend: DynamoDB OCRCache table (API + SQS consumer use this).
 *   3. Optional: This script creates Redis; the SQS consumer Lambda uses it when REDIS_URL is set.
 *
 * Run: node api/create-elasticache.js
 * Then redeploy the API so the consumer gets REDIS_URL and VpcConfig: node api/deploy.js
 */

const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

const ec2 = new AWS.EC2();
const elasticache = new AWS.ElastiCache();
const lambda = new AWS.Lambda();

const REDIS_GROUP_ID = "ocr-cache-redis";
const REDIS_SUBNET_GROUP = "ocr-cache-subnets";
const REDIS_SG_NAME = "ocr-redis-sg";
const CONSUMER_FUNCTION_NAME = "ocr-sqs-consumer";

async function getDefaultVpcAndSubnets() {
    const vpcs = await ec2.describeVpcs({ Filters: [{ Name: "isDefault", Values: ["true"] }] }).promise();
    const vpcId = vpcs.Vpcs && vpcs.Vpcs[0] && vpcs.Vpcs[0].VpcId;
    if (!vpcId) throw new Error("No default VPC found. Create a default VPC or set VPC_ID in the script.");
    const subnets = await ec2.describeSubnets({
        Filters: [{ Name: "vpc-id", Values: [vpcId] }]
    }).promise();
    const subnetIds = (subnets.Subnets || []).map((s) => s.SubnetId).filter(Boolean);
    if (subnetIds.length < 2) throw new Error("Need at least 2 subnets in the VPC for ElastiCache.");
    return { vpcId, subnetIds: subnetIds.slice(0, 2) };
}

async function ensureCacheSubnetGroup(subnetIds) {
    try {
        await elasticache.describeCacheSubnetGroups({ CacheSubnetGroupName: REDIS_SUBNET_GROUP }).promise();
        console.log("Cache subnet group exists:", REDIS_SUBNET_GROUP);
    } catch (e) {
        if (e.code !== "CacheSubnetGroupNotFoundFault") throw e;
        await elasticache.createCacheSubnetGroup({
            CacheSubnetGroupName: REDIS_SUBNET_GROUP,
            CacheSubnetGroupDescription: "Subnets for OCR Redis cache",
            SubnetIds: subnetIds
        }).promise();
        console.log("Created cache subnet group:", REDIS_SUBNET_GROUP);
    }
}

async function ensureSecurityGroup(vpcId) {
    let sgId;
    try {
        const sgs = await ec2.describeSecurityGroups({
            Filters: [
                { Name: "vpc-id", Values: [vpcId] },
                { Name: "group-name", Values: [REDIS_SG_NAME] }
            ]
        }).promise();
        if (sgs.SecurityGroups && sgs.SecurityGroups[0]) {
            sgId = sgs.SecurityGroups[0].GroupId;
            console.log("Security group exists:", REDIS_SG_NAME, sgId);
            return sgId;
        }
    } catch (_) {}
    const create = await ec2.createSecurityGroup({
        GroupName: REDIS_SG_NAME,
        Description: "Allow Lambda to reach Redis (OCR cache)",
        VpcId: vpcId
    }).promise();
    sgId = create.GroupId;
    await ec2.authorizeSecurityGroupIngress({
        GroupId: sgId,
        IpPermissions: [{
            IpProtocol: "tcp",
            FromPort: 6379,
            ToPort: 6379,
            IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "Allow from same VPC (Lambda)" }]
        }]
    }).promise();
    console.log("Created security group:", REDIS_SG_NAME, sgId);
    return sgId;
}

async function createOrGetReplicationGroup(subnetGroupName, securityGroupId) {
    try {
        const existing = await elasticache.describeReplicationGroups({
            ReplicationGroupId: REDIS_GROUP_ID
        }).promise();
        const group = (existing.ReplicationGroups || [])[0];
        if (group && group.Status === "available") {
            const nodeGroups = group.NodeGroups || [];
            const primary = nodeGroups[0];
            const endpoint = primary && primary.PrimaryEndpoint;
            const host = endpoint && endpoint.Address;
            const port = endpoint && endpoint.Port;
            if (host) {
                console.log("Replication group already available:", REDIS_GROUP_ID);
                return `redis://${host}:${port || 6379}`;
            }
        }
        if (group && group.Status !== "available" && group.Status !== "deleted") {
            console.log("Replication group status:", group.Status, "- waiting 30s...");
            await new Promise((r) => setTimeout(r, 30000));
            return createOrGetReplicationGroup(subnetGroupName, securityGroupId);
        }
    } catch (e) {
        if (e.code !== "ReplicationGroupNotFoundFault") throw e;
    }

    await elasticache.createReplicationGroup({
        ReplicationGroupId: REDIS_GROUP_ID,
        ReplicationGroupDescription: "OCR result cache (Redis) for webapp backend",
        Engine: "redis",
        CacheNodeType: "cache.t3.micro",
        NumCacheClusters: 1,
        CacheSubnetGroupName: subnetGroupName,
        SecurityGroupIds: [securityGroupId]
    }).promise();
    console.log("Created replication group:", REDIS_GROUP_ID, "(waiting for available — can take 5–15 min)...");

    const maxWaitMin = 20;
    const intervalSec = 20;
    const maxIterations = Math.ceil((maxWaitMin * 60) / intervalSec);
    for (let i = 0; i < maxIterations; i++) {
        await new Promise((r) => setTimeout(r, intervalSec * 1000));
        const desc = await elasticache.describeReplicationGroups({ ReplicationGroupId: REDIS_GROUP_ID }).promise();
        const group = (desc.ReplicationGroups || [])[0];
        if (group && group.Status === "available") {
            const nodeGroups = group.NodeGroups || [];
            const primary = nodeGroups[0];
            const endpoint = primary && primary.PrimaryEndpoint;
            const host = endpoint && endpoint.Address;
            const port = endpoint && endpoint.Port;
            return `redis://${host}:${port || 6379}`;
        }
        const status = (group && group.Status) || "pending";
        console.log("  Status:", status, `(${Math.round((i + 1) * intervalSec / 60)} min)`);
    }
    throw new Error(
        "Replication group did not become available in " + maxWaitMin + " min. " +
        "It may still be creating in AWS Console → ElastiCache. Re-run this script later to get the endpoint and update the consumer Lambda."
    );
}

async function updateConsumerLambdaWithRedis(redisUrl, subnetIds, securityGroupId) {
    const fn = await lambda.getFunctionConfiguration({ FunctionName: CONSUMER_FUNCTION_NAME }).promise();
    const currentEnv = fn.Environment && fn.Environment.Variables ? fn.Environment.Variables : {};
    const newEnv = { ...currentEnv, REDIS_URL: redisUrl };
    const vpcConfig = {
        SubnetIds: subnetIds,
        SecurityGroupIds: [securityGroupId]
    };
    await lambda.updateFunctionConfiguration({
        FunctionName: CONSUMER_FUNCTION_NAME,
        Environment: { Variables: newEnv },
        VpcConfig: vpcConfig
    }).promise();
    console.log("✅ Consumer Lambda updated with REDIS_URL and VpcConfig (same VPC as Redis).");
    console.log("   Redeploy consumer code if needed: node api/deploy.js");
}

(async () => {
    try {
        console.log("📦 Creating ElastiCache (Redis) for OCR cache (backend only; webapp uses sessionStorage + this via API)...\n");
        const { vpcId, subnetIds } = await getDefaultVpcAndSubnets();
        await ensureCacheSubnetGroup(subnetIds);
        const sgId = await ensureSecurityGroup(vpcId);
        const redisUrl = await createOrGetReplicationGroup(REDIS_SUBNET_GROUP, sgId);
        console.log("\n✅ Redis endpoint:", redisUrl);
        await updateConsumerLambdaWithRedis(redisUrl, subnetIds, sgId);
        console.log("\n🎉 ElastiCache is ready. Consumer Lambda will use Redis when REDIS_URL is set.");
        console.log("   Webapp caching: (1) Browser sessionStorage (2) API/consumer DynamoDB (3) Consumer Redis when REDIS_URL set.");
    } catch (err) {
        console.error("Error:", err.message || err);
        process.exit(1);
    }
})();
