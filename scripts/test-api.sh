#!/bin/bash

# Engine API Test Script
# Usage: ./scripts/test-api.sh [base_url] [api_key]

BASE_URL="${1:-http://localhost:3000}"
API_KEY="${2:-engine_test_local_dev_key_12345}"

echo "================================"
echo "Engine API Tests"
echo "Base URL: $BASE_URL"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${YELLOW}→${NC} $1"; }

# Test 1: Health check (landing page)
echo "Test 1: Health Check"
info "GET /"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$RESPONSE" == "200" ]; then
  pass "Landing page accessible"
else
  fail "Landing page returned $RESPONSE"
fi
echo ""

# Test 2: List jobs (empty)
echo "Test 2: List Jobs"
info "GET /api/v1/jobs"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/jobs")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
  pass "List jobs endpoint works"
  info "Response: $BODY"
else
  fail "List jobs returned $HTTP_CODE"
  info "Response: $BODY"
fi
echo ""

# Test 3: Create a job
echo "Test 3: Create Job"
info "POST /api/v1/jobs"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "Calculate the sum of numbers from 1 to 100 and print the result", "model": "anthropic/claude-sonnet-4"}' \
  "$BASE_URL/api/v1/jobs")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "200" ]; then
  pass "Create job endpoint works"
  JOB_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  info "Created job: $JOB_ID"
  info "Response: $BODY"
else
  fail "Create job returned $HTTP_CODE"
  info "Response: $BODY"
  JOB_ID=""
fi
echo ""

# Test 4: Get job details (if we created one)
if [ -n "$JOB_ID" ]; then
  echo "Test 4: Get Job Details"
  info "GET /api/v1/jobs/$JOB_ID"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE_URL/api/v1/jobs/$JOB_ID")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  if [ "$HTTP_CODE" == "200" ]; then
    pass "Get job details works"
    info "Response: $BODY"
  else
    fail "Get job details returned $HTTP_CODE"
    info "Response: $BODY"
  fi
  echo ""

  # Test 5: Get job logs
  echo "Test 5: Get Job Logs"
  info "GET /api/v1/jobs/$JOB_ID/logs"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE_URL/api/v1/jobs/$JOB_ID/logs")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  if [ "$HTTP_CODE" == "200" ]; then
    pass "Get job logs works"
    info "Response: $BODY"
  else
    fail "Get job logs returned $HTTP_CODE"
    info "Response: $BODY"
  fi
  echo ""
fi

# Test 6: List agents
echo "Test 6: List Agents"
info "GET /api/v1/agents"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/v1/agents")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
  pass "List agents works"
  AGENT_COUNT=$(echo "$BODY" | grep -o '"name"' | wc -l)
  info "Found $AGENT_COUNT agents"
else
  fail "List agents returned $HTTP_CODE"
  info "Response: $BODY"
fi
echo ""

# Test 7: Discover agents for a task
echo "Test 7: Discover Agents"
info "POST /api/v1/agents/discover"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "scrape a website and analyze the data"}' \
  "$BASE_URL/api/v1/agents/discover")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
  pass "Agent discovery works"
  info "Response: $BODY"
else
  fail "Agent discovery returned $HTTP_CODE"
  info "Response: $BODY"
fi
echo ""

# Test 8: Admin - List workers
echo "Test 8: List Workers (Admin)"
info "GET /api/v1/admin/workers"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/v1/admin/workers")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
  pass "List workers works"
  info "Response: $BODY"
else
  fail "List workers returned $HTTP_CODE (may need admin scope)"
  info "Response: $BODY"
fi
echo ""

# Test 9: Admin - Get metrics
echo "Test 9: Get Metrics (Admin)"
info "GET /api/v1/admin/metrics"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/api/v1/admin/metrics")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" == "200" ]; then
  pass "Get metrics works"
  info "Response: $BODY"
else
  fail "Get metrics returned $HTTP_CODE (may need admin scope)"
  info "Response: $BODY"
fi
echo ""

echo "================================"
echo "Tests Complete"
echo "================================"
