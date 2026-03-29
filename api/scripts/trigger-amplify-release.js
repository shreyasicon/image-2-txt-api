/**
 * Trigger an Amplify Hosting build/deploy from the latest commit on the connected Git branch.
 * Use after `git push` so the console shows your local changes (Git-connected apps cannot use manual zip upload).
 *
 *   node scripts/trigger-amplify-release.js
 *
 * Env: AMPLIFY_APP_ID (default d106ktv35b9lnn), AMPLIFY_BRANCH (default main), AWS_REGION
 */
const AWS = require("aws-sdk");

const AMPLIFY_APP_ID = process.env.AMPLIFY_APP_ID || "d106ktv35b9lnn";
const AMPLIFY_BRANCH = process.env.AMPLIFY_BRANCH || "main";

AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });
const amplify = new AWS.Amplify();

(async () => {
  try {
    const start = await amplify
      .startJob({
        appId: AMPLIFY_APP_ID,
        branchName: AMPLIFY_BRANCH,
        jobType: "RELEASE"
      })
      .promise();

    const jobId = start.jobSummary?.jobId;
    if (!jobId) throw new Error("startJob did not return jobId");

    console.log("Amplify job started:", jobId, "(RELEASE = build from latest Git commit on branch)");
    const maxWait = 600000;
    const t0 = Date.now();
    while (Date.now() - t0 < maxWait) {
      const job = await amplify.getJob({ appId: AMPLIFY_APP_ID, branchName: AMPLIFY_BRANCH, jobId }).promise();
      const status = job.job.summary?.status;
      if (status === "SUCCEED") {
        console.log("Build/deploy succeeded.");
        console.log("URL: https://" + AMPLIFY_BRANCH + "." + AMPLIFY_APP_ID + ".amplifyapp.com");
        return;
      }
      if (status === "FAILED" || status === "CANCELLED") {
        throw new Error("Job " + status);
      }
      await new Promise((r) => setTimeout(r, 8000));
    }
    throw new Error("Timed out waiting for Amplify job");
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
