#!/bin/bash
echo "🚀 Preparing to deploy AWS Lambda function..."

# Zip files
zip -r9 build.zip lambda_function.js package.json

# Deploy to AWS
aws lambda update-function-code \
    --function-name IncidentAlertLambda \
    --zip-file fileb://build.zip \
    --region ap-south-1

echo "✅ Deployment complete!"
