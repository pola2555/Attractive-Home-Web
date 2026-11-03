#!/usr/bin/env bash
#
# ONE-TIME, USER-RUN: create the EC2 instance role the app box uses to write DB
# backups to S3, and attach it to the box. Claude Code's auto-mode permission
# classifier blocks `aws iam *` mutations, so this is run by you (the account
# owner), not by Claude.
#
# It is IDEMPOTENT and strictly SCOPED:
#   - trusts only the EC2 service
#   - can ListBucket (prefix db-backups/*), PutObject and GetObject under
#     db-backups/* ONLY
#   - has NO s3:DeleteObject and NO access outside db-backups/* — it CANNOT
#     delete or touch any of the real media in the bucket (honors the
#     "don't remove any file from S3" rule).
#
# Run it from anywhere with the Pola admin AWS credentials active:
#   bash scripts/setup-backup-iam.sh
#
# Afterwards, Claude (or you) can finish the box side: install awscli, drop
# scripts/backup-db.sh on the box, and add the nightly cron.

set -euo pipefail

ROLE="attractive-home-app"
PROFILE="attractive-home-app"
BUCKET="attractive.home.ae"
REGION="ap-south-1"
INSTANCE_ID="i-0192b0995789109e2"

TRUST='{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}'

POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBackupPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::'"$BUCKET"'",
      "Condition": { "StringLike": { "s3:prefix": "db-backups/*" } }
    },
    {
      "Sid": "ReadWriteBackupsNoDelete",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::'"$BUCKET"'/db-backups/*"
    }
  ]
}'

echo "==> 1/5 create role $ROLE (ec2 trust)"
aws iam create-role --role-name "$ROLE" \
  --assume-role-policy-document "$TRUST" \
  --description "EC2 instance role for the Attractive Home box: write DB backups to S3 (no delete)" \
  >/dev/null 2>&1 && echo "   created" || echo "   already exists (ok)"

echo "==> 2/5 put inline no-delete S3 backup policy"
aws iam put-role-policy --role-name "$ROLE" \
  --policy-name "s3-db-backups-no-delete" \
  --policy-document "$POLICY"
echo "   policy set"

echo "==> 3/5 create instance profile $PROFILE"
aws iam create-instance-profile --instance-profile-name "$PROFILE" \
  >/dev/null 2>&1 && echo "   created" || echo "   already exists (ok)"

echo "==> 4/5 add role to instance profile"
aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE" \
  --role-name "$ROLE" >/dev/null 2>&1 && echo "   added" || echo "   already added (ok)"

# IAM is eventually consistent; the instance profile must exist before associate.
echo "   waiting for instance profile to propagate..."
sleep 10

echo "==> 5/5 associate instance profile with the box ($INSTANCE_ID)"
if aws ec2 describe-iam-instance-profile-associations --region "$REGION" \
     --filters "Name=instance-id,Values=$INSTANCE_ID" \
     --query 'IamInstanceProfileAssociations[?State==`associated`]' --output text | grep -q .; then
  echo "   an instance profile is already associated (ok) — verify it is $PROFILE below"
else
  aws ec2 associate-iam-instance-profile --region "$REGION" \
    --instance-id "$INSTANCE_ID" \
    --iam-instance-profile "Name=$PROFILE"
  echo "   associated"
fi

echo
echo "Done. Current association on the box:"
aws ec2 describe-iam-instance-profile-associations --region "$REGION" \
  --filters "Name=instance-id,Values=$INSTANCE_ID" \
  --query 'IamInstanceProfileAssociations[].{Profile:IamInstanceProfile.Arn,State:State}' \
  --output table
