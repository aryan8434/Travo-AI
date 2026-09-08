# AWS launch handoff

This deployment creates one Amazon Linux 2023 EC2 instance, a dedicated VPC/public subnet, a 40 GB encrypted gp3 root disk and an Elastic IP. The default is `t3.small` in Mumbai (`ap-south-1`), with standard CPU credits. It opens only TCP 80/443 inbound. Administration uses AWS Systems Manager Session Manager; there is no SSH key or open port 22. IMDSv2 is required.

Caddy serves HTTPS and proxies to Node on loopback port 5000. The app runs as the non-root Node user with a read-only container filesystem. Vectra persists under `/var/lib/travo/index` across application/container restarts; it rebuilds from packaged JSON if the instance is replaced. MongoDB must be external persistent storage with backups. This is a single-server deployment, with downtime during upgrades; it is not a highly available cluster.

## Prerequisites

1. Configure AWS CLI v2 with an authenticated profile for the intended account. Prefer IAM Identity Center/SSO. The deployment identity needs CloudFormation, EC2/VPC, IAM role/profile, S3 release upload and SSM parameter metadata permissions. Keep keys out of chat and Git.
2. Agree the region, instance size and monthly budget before executing the change set. EC2, the 40 GB disk, public IPv4, S3, bandwidth and external MongoDB have separate charges. The template has no spending cap. Check the current [AWS Pricing Calculator](https://calculator.aws/) for your account/region; no fixed quote or free-tier eligibility is assumed.
3. Provide a domain you control and an existing private S3 bucket in the same AWS account/region, with public access blocked. Releases use SSE-S3 encryption. Configure lifecycle rules to expire old release archives according to your retention policy.
4. Revoke the historical Razorpay key and store fresh live keys, a separate random webhook secret, JWT secret and MongoDB URI in SSM Parameter Store as a `SecureString` named `/travo/production/env`. Use the default SSM KMS key; a custom KMS key requires an additional explicit decrypt grant on the instance role.

The SecureString value is an environment file containing unquoted `KEY=value` lines. Minimum contents:

```dotenv
JWT_SECRET=REPLACE_WITH_A_UNIQUE_RANDOM_SECRET
MONGO_URI=REPLACE_WITH_YOUR_PERSISTENT_MONGODB_URI
RAZORPAY_KEY_ID=REPLACE_WITH_A_FRESH_LIVE_KEY_ID
RAZORPAY_KEY_SECRET=REPLACE_WITH_A_FRESH_LIVE_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET
EMBEDDING_PROVIDER=auto
GEMINI_API_KEY=REPLACE_WITH_YOUR_GEMINI_KEY
LLM_PROVIDER=groq
GROQ_API_KEY=REPLACE_WITH_YOUR_GROQ_KEY
```

Authentication and webhook secrets must each have at least 32 characters. Provider keys are optional for offline RAG, but payment credentials are required in production. Set any optional model overrides from `.env.example`. Do not put this environment file inside the release, CloudFormation parameters or EC2 user data. The host retrieves it using its instance role and saves a root-only file. Restrict the MongoDB network allowlist to the resulting Elastic IP and enable database backups; an initial bootstrap readiness failure can be resolved after the IP is allowlisted.

## Prepare and launch

From the repository root in PowerShell:

```powershell
npm test
npm run lint
npm run check:production
node scripts/packageRelease.mjs

./deploy/aws/deploy.ps1 -ExpectedAccountId YOUR_12_DIGIT_ACCOUNT_ID -Profile YOUR_PROFILE -ArtifactBucket YOUR_PRIVATE_BUCKET -DomainName travel.yourdomain.com
```

`check:production` reads the local environment without printing secrets. It is a configuration check, not remote credential validation. Production settings are supplied separately through SSM on the instance.

The deployment script checks the account identity and SecureString metadata, packages an explicit source allowlist, uploads a checksum-addressed archive and prepares a CloudFormation change set. The archive excludes `.env` files, Git history, tests, local indexes, node_modules and private-key files. Add `-Execute` to execute the reviewed infrastructure changes. The script creates an instance only when this flag is passed; it does not create the prerequisite bucket or secret.

CloudFormation completion means the infrastructure exists, not that the application bootstrap succeeded. Inspect `/var/log/cloud-init-output.log` and `journalctl -u travo.service` through Session Manager. Never print `/etc/travo/app.env` into logs or chat. Docker image building requires outbound access to package/image registries. Base image tags receive security patches on each build; record and pin tested image digests in your release process for reproducibility.

Set the domain's A record to the `PublicIp` stack output. Caddy obtains a TLS certificate after DNS resolves to the instance and inbound 80/443 are reachable. Verify:

```text
https://YOUR_DOMAIN/health/live
https://YOUR_DOMAIN/health/ready
```

The first checks the HTTP process; the second returns HTTP 503 while persistent account storage is unavailable. Production startup validates settings, connects MongoDB and indexes the catalogue before accepting traffic.

## Live payments

Configure `https://YOUR_DOMAIN/api/payments/webhook` in the Razorpay live dashboard with the exact same webhook secret and subscribe to `payment.captured`, `order.paid`, `refund.processed` and `payment.dispute.created`. Signature checks use raw request bytes. Captured notifications independently fetch the payment from Razorpay and use the same atomic settlement as browser verification. Duplicates cannot add credit twice.

Enable automatic capture in Razorpay. Complete a separately authorized small real transaction after deployment; the automated tests never charge a real card. Refund/dispute notifications set `paymentReviewRequired` and block further financial writes. A person must reconcile the gateway, wallet and supplier records before clearing that flag; refunds and chargebacks are not guessed or automatically reversed.

Old ledgers remain blocked until reconciled. Package bookings remain subject to supplier confirmation. Flight estimates and unconnected hotel/bus rates do not receive payable quotes. Production hides generated hotel/bus inventory; real-time reservations require contracted provider integrations.

## Operations and updates

- Containers restart after a crash or host reboot. Container logs rotate at 10 MB × 3 per container. Set up external uptime monitoring and database backups before receiving customer funds.
- Secrets are fetched at bootstrap, not on every request. After rotation, fetch the SecureString again with the same role into the root-only file, preserve deployment networking settings, and restart the app. Never copy stale environment files from a development machine.
- Updating CloudFormation user data does not reliably redeploy an already booted instance. Use a maintenance window and Session Manager to download/checksum the new release, rebuild the image and restart the two services, or create a replacement stack and switch DNS. Back up data and retain the previous image/archive for rollback. Do not use the initial provisioning script as an unattended rolling-deployment system.
- Removing the stack removes its instance/root disk/IP and networking. Back up anything needed first. External MongoDB, the S3 bucket and the SSM secret are not owned or deleted by this template.

## Current execution status

Prepared locally; no AWS instance has been created. This workspace has no AWS CLI/profile or credentials configured. The local production preflight reports a Git-exposed Razorpay key, missing webhook secret and missing public HTTPS origin. CloudFormation and real gateway validation remain pending authenticated account access.

References: [AWS AL2023 AMIs](https://docs.aws.amazon.com/linux/al2023/ug/ec2.html), [EC2 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html), [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/).
