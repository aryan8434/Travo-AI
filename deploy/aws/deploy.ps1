param(
    [Parameter(Mandatory=$true)][ValidatePattern('^\d{12}$')][string]$ExpectedAccountId,
    [Parameter(Mandatory=$true)][string]$Profile,
    [Parameter(Mandatory=$true)][string]$ArtifactBucket,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9.-]+$')][string]$DomainName,
    [string]$Region = 'ap-south-1',
    [string]$StackName = 'travo-production',
    [string]$EnvironmentParameter = '/travo/production/env',
    [ValidateSet('t3.small','t3.medium')][string]$InstanceType = 't3.small',
    [switch]$Execute
)
$ErrorActionPreference = 'Stop'
$travoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'AWS CLI v2 is required. Configure an authenticated profile before deploying.' }
function Invoke-TravoAws {
    param([string[]]$Arguments)
    $output = & aws @Arguments --profile $Profile --region $Region --no-cli-pager
    if ($LASTEXITCODE -ne 0) { throw 'AWS command failed. No further deployment steps will run.' }
    return $output
}
$identity = (Invoke-TravoAws -Arguments @('sts','get-caller-identity','--output','json')) | ConvertFrom-Json
if ($identity.Account -ne $ExpectedAccountId) { throw 'AWS account does not match ExpectedAccountId.' }
Invoke-TravoAws -Arguments @('s3api','head-bucket','--bucket',$ArtifactBucket,'--expected-bucket-owner',$ExpectedAccountId) | Out-Null
# Check existence and SecureString type without retrieving the secret value.
$metadata = (Invoke-TravoAws -Arguments @('ssm','describe-parameters','--parameter-filters',"Key=Name,Option=Equals,Values=$EnvironmentParameter",'--output','json')) | ConvertFrom-Json
if (-not ($metadata.Parameters | Where-Object { $_.Name -eq $EnvironmentParameter -and $_.Type -eq 'SecureString' })) { throw 'Create the production environment SecureString in SSM before deploying.' }
$releaseJson = & node (Join-Path $travoRoot 'scripts/packageRelease.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Release packaging failed.' }
$release = $releaseJson | ConvertFrom-Json
Invoke-TravoAws -Arguments @('cloudformation','validate-template','--template-body',"file://$PSScriptRoot/instance.json") | Out-Null
Invoke-TravoAws -Arguments @('s3api','put-object','--bucket',$ArtifactBucket,'--key',$release.key,'--body',$release.archive,'--server-side-encryption','AES256','--expected-bucket-owner',$ExpectedAccountId) | Out-Null
$deployArguments = @('cloudformation','deploy','--template-file',"$PSScriptRoot/instance.json",'--stack-name',$StackName,'--capabilities','CAPABILITY_IAM','--parameter-overrides',"ArtifactBucket=$ArtifactBucket","ArtifactKey=$($release.key)","ArtifactSha256=$($release.sha256)","EnvironmentParameter=$EnvironmentParameter","DomainName=$DomainName","InstanceType=$InstanceType")
if (-not $Execute) { $deployArguments += '--no-execute-changeset' }
Invoke-TravoAws -Arguments $deployArguments
if ($Execute) {
    Invoke-TravoAws -Arguments @('cloudformation','describe-stacks','--stack-name',$StackName,'--query','Stacks[0].Outputs','--output','table')
    Write-Output 'Infrastructure created. Check cloud-init/application readiness, point domain DNS to PublicIp, then verify HTTPS and webhook delivery.'
} else {
    Write-Output 'Change set prepared. Review its account, instance, disk and public-IP costs before executing it.'
}
