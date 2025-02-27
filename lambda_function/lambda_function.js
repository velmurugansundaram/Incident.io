const AWS = require("aws-sdk");
const axios = require("axios");

// Initialize AWS Secrets Manager
const secretsManager = new AWS.SecretsManager();

exports.handler = async (event) => {
    try {
        console.log("🚀 Lambda Execution Started...");

        // ✅ Step 1: Retrieve Secrets from AWS Secrets Manager
        const secretData = await secretsManager.getSecretValue({ SecretId: "poc" }).promise();
        const secrets = JSON.parse(secretData.SecretString);

        const chatGPTApiKey = secrets.ChatGPT_API_Key;
        const slackWebhookUrl = secrets.Slack_Webhook_URL;
        const incidentIoApiKey = secrets.INCIDENT_IO_API_KEY;

        const logMessage = `AWS Infra Change Detected:\n${JSON.stringify(event, null, 2)}`;

        // ✅ Step 2: Generate a Runbook using ChatGPT (MODIFIED)
        console.log("📖 Generating Runbook from ChatGPT...");

        // Extract important event details for context
        const instanceId = event.detail?.requestParameters?.instancesSet?.items[0]?.instanceId || "Unknown";
        const eventName = event.detail?.eventName || "Unknown";
        const eventTime = event.detail?.eventTime || "Unknown";
        const userArn = event.detail?.userIdentity?.arn || "Unknown";
        const userIP = event.detail?.sourceIPAddress || "Unknown";

        const chatGPTResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4",
                messages: [
                    { 
                        role: "system", 
                        content: "You are an AWS DevOps expert. Provide a **step-by-step incident response guide** that an on-call engineer can follow **in the AWS Console** to investigate and remediate AWS infrastructure changes."
                    },
                    { 
                        role: "user", 
                        content: `An AWS infrastructure event has been detected. Below are the details:

🔹 **Event Name:** ${eventName}  
🔹 **Affected Instance ID:** ${instanceId}  
🔹 **Time of Incident:** ${eventTime}  
🔹 **User Who Triggered Event:** ${userArn}  
🔹 **User IP Address:** ${userIP}  

📖 **Generate a structured, actionable runbook including:**
1️⃣ **How to investigate who triggered the event using AWS CloudTrail.**  
2️⃣ **Step-by-step instructions to check IAM permissions of the user.**  
3️⃣ **Clear AWS Console steps to start the stopped instance (if applicable).**  
4️⃣ **Verification steps to ensure the instance is back to normal.**  
5️⃣ **Security best practices to prevent unauthorized changes.**`
                    }
                ]
            },
            {
                headers: { "Authorization": `Bearer ${chatGPTApiKey}`, "Content-Type": "application/json" }
            }
        );

        const runbook = chatGPTResponse.data.choices[0].message.content;

        // ✅ Step 3: Send an Alert to Slack
        console.log("📢 Sending Alert to Slack...");
        await axios.post(slackWebhookUrl, { text: `🚨 *Incident Alert!* ��\n${logMessage}\n📖 Runbook: ${runbook}` });

        // ✅ Step 4: Fetch Severity ID and Incident Type ID dynamically
        console.log("🔄 Fetching Severity ID and Incident Type ID from Incident.io...");

        // Fetch Severities
        const severitiesResponse = await axios.get("https://api.incident.io/v1/severities", {
            headers: { Authorization: `Bearer ${incidentIoApiKey}` },
        });

        const severity_id = severitiesResponse.data.severities.find((s) => s.name === "Major")?.id;

        // Fetch Incident Types
        const incidentTypesResponse = await axios.get("https://api.incident.io/v1/incident_types", {
            headers: { Authorization: `Bearer ${incidentIoApiKey}` },
        });

        const incident_type_id = incidentTypesResponse.data.incident_types.find((t) => t.is_default)?.id;

        if (!severity_id || !incident_type_id) {
            throw new Error("❌ Failed to fetch severity_id or incident_type_id from Incident.io");
        }

        console.log(`✅ Using severity_id: ${severity_id}, incident_type_id: ${incident_type_id}`);

        // ✅ Step 5: Report the Incident to Incident.io
        console.log("🛠️ Reporting to Incident.io...");
        const incidentPayload = {
            title: "AWS Infra Change Detected",
            description: logMessage,
            status: "triage",  // ✅ Must be one of ["triage", "investigating", "monitoring", "resolved"]
            severity_id,
            impact: "major",  // ✅ Must be ["minor", "major", "critical"]
            visibility: "public",
            incident_type_id,
            idempotency_key: `${Date.now()}-incident`,  // ✅ Prevents duplicate incidents
            runbook  // ✅ Text string for runbook
        };

        const incidentResponse = await axios.post("https://api.incident.io/v1/incidents", incidentPayload, {
            headers: { Authorization: `Bearer ${incidentIoApiKey}`, "Content-Type": "application/json" },
        });

        console.log("✅ Incident Created Successfully:", incidentResponse.data);

        return { statusCode: 200, body: JSON.stringify(incidentResponse.data) };
    } catch (error) {
        console.error("❌ Error Creating Incident:", error.response ? error.response.data : error.message);
        return { statusCode: error.response ? error.response.status : 500, body: JSON.stringify(error.message) };
    }
};
