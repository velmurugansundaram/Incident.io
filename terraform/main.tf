provider "aws" {
  region = "ap-south-1"
}

resource "aws_cloudwatch_event_rule" "aws_changes_rule" {
  name        = "AWSResourceChanges"
  description = "Triggers when AWS resources change"
  event_pattern = jsonencode({
    "source" : ["aws.ec2", "aws.s3", "aws.iam", "aws.lambda"],
    "detail-type" : ["AWS API Call via CloudTrail"]
  })
}

resource "aws_cloudwatch_event_target" "send_to_lambda" {
  rule      = aws_cloudwatch_event_rule.aws_changes_rule.name
  target_id = "LambdaTarget"
  arn       = aws_lambda_function.incident_lambda.arn
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.incident_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.aws_changes_rule.arn
}

resource "aws_cloudwatch_dashboard" "incident_dashboard" {
  dashboard_name = "AWS_Incident_Dashboard"
  dashboard_body = file("../dashboards/cloudwatch_dashboard.json")
}

resource "aws_lambda_function" "incident_lambda" {
  function_name = "IncidentAlertLambda"
  role          = "arn:aws:iam::762233754896:role/IncidentLambdaRole"  # Using manually created IAM Role
  runtime       = "nodejs18.x"
  handler       = "lambda_function.handler"
  timeout       = 30
  memory_size   = 512

  filename         = "../lambda_function/build.zip"
  source_code_hash = filebase64sha256("../lambda_function/build.zip")

  environment {
    variables = {
      SECRETS_MANAGER_ARN = "arn:aws:secretsmanager:ap-south-1:762233754896:secret:poc"
      SECRET_ID           = "poc"
    }
  }
}

output "dashboard_url" {
  value = "https://${aws_cloudwatch_dashboard.incident_dashboard.dashboard_name}.console.aws.amazon.com/"
}
