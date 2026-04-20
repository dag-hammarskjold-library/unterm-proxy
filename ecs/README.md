# ECS Deployment

This repository is ready to run as a single Fargate task behind an Application Load Balancer.

## Assumptions

- The container listens on port 3000.
- The ALB terminates TLS.
- The ALB health check points at `/unterm/health`.
- The task runs in private subnets with outbound internet access for the upstream UNTERM APIs.

## Build And Push

```bash
docker build -t unterm-linked-data-app .
aws ecr create-repository --repository-name unterm-linked-data-app
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag unterm-linked-data-app:latest <account>.dkr.ecr.<region>.amazonaws.com/unterm-linked-data-app:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/unterm-linked-data-app:latest
```

## Register The Task Definition

1. Edit [task-definition.json](task-definition.json) and replace the role ARN, image URI, region, and log group values.
2. Register it:

```bash
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json
```

## Create The Service

Create an ECS service using the task definition, then attach it to an ALB target group configured for port 3000 and path `/unterm/health`.

Recommended service settings:

- Launch type: Fargate
- Desired count: 1 or more
- Network mode: `awsvpc`
- Public IP: disabled
- Security group: allow inbound only from the ALB security group on port 3000
- Health check grace period: 30-60 seconds

## Runtime Variables

The image supports these environment variables:

- `PORT`
- `DEBUG_REQUEST_HEADERS`
- `UPSTREAM_TIMEOUT_MS`
- `SHUTDOWN_TIMEOUT_MS`
- `REMOTE_API_BASE`
- `API_BASE`
- `WEB_BASE`
- `COUNTRIES_API_BASE`

## Notes

- The container already exposes `/unterm/health` for ALB checks.
- Shutdown is handled on `SIGTERM`, which works with ECS rolling deployments.
- If you need stronger production observability, add CloudWatch metrics and access logs at the ALB layer.
