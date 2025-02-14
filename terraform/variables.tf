variable "aws_region" {
  description = "AWS Region"
  default     = "ap-south-1"
}

variable "secrets_manager_arn" {
  description = "ARN of the AWS Secrets Manager secret containing API keys"
  default     = "arn:aws:secretsmanager:ap-south-1:762233754896:secret:poc"
}
