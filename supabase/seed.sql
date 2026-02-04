-- Local Development Seed Data
-- Run this after migrations to set up test data

-- Test API Key: engine_test_local_dev_key_12345
-- This is a pre-hashed key for local development only
INSERT INTO api_keys (key_prefix, key_hash, name, owner_email, scopes, rate_limit_rpm)
VALUES (
  'engine_test_...',
  -- SHA256 hash of: engine_test_local_dev_key_12345
  '51c6880443201c5bed628ef2d1f0589824a299efe10b67426e3ae6ae57acdb42',
  'Local Dev Admin',
  'dev@localhost',
  ARRAY['admin', 'jobs:read', 'jobs:write', 'jobs:delete', 'agents:read', 'agents:write'],
  1000
)
ON CONFLICT (key_hash) DO NOTHING;

-- Additional test key with limited scope
INSERT INTO api_keys (key_prefix, key_hash, name, owner_email, scopes, rate_limit_rpm)
VALUES (
  'engine_test_...',
  -- SHA256 hash of: engine_test_readonly_key_67890
  '95cd5d443ada754746d00511231e1d46442724ffc59b39225a1f9fb4a656eab1',
  'Read Only Test Key',
  'readonly@localhost',
  ARRAY['jobs:read', 'agents:read'],
  100
)
ON CONFLICT (key_hash) DO NOTHING;
