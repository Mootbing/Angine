#!/bin/bash

# Engine Job Lifecycle Test
# Tests creating a job and polling until completion
# Usage: ./scripts/test-job-lifecycle.sh [base_url] [api_key]

BASE_URL="${1:-http://localhost:3000}"
API_KEY="${2:-engine_test_local_dev_key_12345}"

echo "================================"
echo "Job Lifecycle Test"
echo "Base URL: $BASE_URL"
echo "================================"
echo ""

# Create a simple job
echo "Creating job..."
RESPONSE=$(curl -s \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Write a Python script that prints the Fibonacci sequence up to 10 numbers",
    "model": "anthropic/claude-sonnet-4",
    "timeout_seconds": 120
  }' \
  "$BASE_URL/api/v1/jobs")

JOB_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
  echo "Failed to create job"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Created job: $JOB_ID"
echo ""

# Poll for completion
echo "Polling for completion (max 60 attempts)..."
for i in {1..60}; do
  RESPONSE=$(curl -s \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE_URL/api/v1/jobs/$JOB_ID")

  STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

  echo "[$i] Status: $STATUS"

  if [ "$STATUS" == "completed" ]; then
    echo ""
    echo "================================"
    echo "Job completed successfully!"
    echo "================================"
    echo ""
    echo "Result:"
    echo "$RESPONSE" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\\n/\n/g'
    echo ""

    # Get artifacts
    echo "Checking for artifacts..."
    ARTIFACTS=$(curl -s \
      -H "Authorization: Bearer $API_KEY" \
      "$BASE_URL/api/v1/jobs/$JOB_ID" | grep -o '"artifacts":\[[^]]*\]')
    echo "Artifacts: $ARTIFACTS"
    exit 0
  fi

  if [ "$STATUS" == "failed" ]; then
    echo ""
    echo "================================"
    echo "Job failed!"
    echo "================================"
    echo ""
    echo "Error:"
    echo "$RESPONSE" | grep -o '"error_message":"[^"]*"' | head -1 | cut -d'"' -f4
    exit 1
  fi

  if [ "$STATUS" == "waiting_for_user" ]; then
    echo ""
    echo "Job is waiting for user input"
    QUESTION=$(echo "$RESPONSE" | grep -o '"agent_question":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Question: $QUESTION"
    echo ""
    echo "Responding with 'yes, proceed'..."
    curl -s -X POST \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"answer": "yes, proceed"}' \
      "$BASE_URL/api/v1/jobs/$JOB_ID/respond"
    echo ""
  fi

  sleep 2
done

echo "Timeout waiting for job completion"
exit 1
