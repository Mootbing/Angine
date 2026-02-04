-- Add MCP Server support to agents table
-- Version: 2.1.0

-- Add type column to distinguish between python packages and MCP servers
ALTER TABLE agents ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'python_package'
  CHECK (type IN ('python_package', 'mcp_server'));

-- MCP-specific fields
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_transport TEXT
  CHECK (mcp_transport IS NULL OR mcp_transport IN ('stdio', 'sse', 'http'));
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_command TEXT; -- Command to run the server
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_args TEXT[]; -- Arguments for the command
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_env JSONB DEFAULT '{}'; -- Environment variables
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mcp_tools JSONB DEFAULT '[]'; -- Available tools exposed by the MCP server

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type) WHERE verified = true;

-- ============================================
-- Seed Data: MCP Servers
-- ============================================

INSERT INTO agents (
  name, description, package_name, version, category,
  type, mcp_transport, mcp_command, mcp_args, mcp_tools,
  documentation, repository_url, author,
  is_builtin, verified, verified_at
)
VALUES
  (
    'Filesystem MCP',
    'Secure file operations with configurable access controls. Read, write, search, and manage files and directories. Supports pattern matching and directory trees.',
    '@modelcontextprotocol/server-filesystem',
    '1.0.0',
    'file',
    'mcp_server',
    'stdio',
    'npx',
    ARRAY['-y', '@modelcontextprotocol/server-filesystem', '/home/user'],
    '[
      {"name": "read_file", "description": "Read complete contents of a file"},
      {"name": "read_multiple_files", "description": "Read multiple files simultaneously"},
      {"name": "write_file", "description": "Create or overwrite a file"},
      {"name": "edit_file", "description": "Make selective edits using advanced pattern matching"},
      {"name": "create_directory", "description": "Create a new directory or nested directories"},
      {"name": "list_directory", "description": "List directory contents with [FILE] or [DIR] prefixes"},
      {"name": "directory_tree", "description": "Get recursive tree view of files and directories"},
      {"name": "move_file", "description": "Move or rename files and directories"},
      {"name": "search_files", "description": "Recursively search for files/directories matching pattern"},
      {"name": "get_file_info", "description": "Get detailed file/directory metadata"}
    ]'::jsonb,
    'Official MCP reference server for filesystem operations. Provides secure, configurable file system access.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Fetch MCP',
    'Web content fetching and conversion for efficient LLM usage. Fetches URLs and converts HTML to markdown, handles robots.txt compliance.',
    '@modelcontextprotocol/server-fetch',
    '1.0.0',
    'web',
    'mcp_server',
    'stdio',
    'npx',
    ARRAY['-y', '@modelcontextprotocol/server-fetch'],
    '[
      {"name": "fetch", "description": "Fetches a URL and returns content as markdown. Handles HTML to markdown conversion automatically."}
    ]'::jsonb,
    'Official MCP reference server for fetching web content. Converts HTML to LLM-friendly markdown format.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'GitHub MCP',
    'Full GitHub API integration. Manage repositories, issues, pull requests, branches, files, and more. Supports creating PRs, searching code, and repository management.',
    '@modelcontextprotocol/server-github',
    '1.0.0',
    'web',
    'mcp_server',
    'stdio',
    'npx',
    ARRAY['-y', '@modelcontextprotocol/server-github'],
    '[
      {"name": "create_or_update_file", "description": "Create or update a single file in a repository"},
      {"name": "search_repositories", "description": "Search for GitHub repositories"},
      {"name": "create_repository", "description": "Create a new GitHub repository"},
      {"name": "get_file_contents", "description": "Get contents of a file or directory"},
      {"name": "push_files", "description": "Push multiple files in a single commit"},
      {"name": "create_issue", "description": "Create a new issue in a repository"},
      {"name": "create_pull_request", "description": "Create a new pull request"},
      {"name": "fork_repository", "description": "Fork a repository to your account"},
      {"name": "create_branch", "description": "Create a new branch in a repository"},
      {"name": "list_commits", "description": "Get list of commits in a branch"},
      {"name": "list_issues", "description": "List issues in a repository with filters"},
      {"name": "update_issue", "description": "Update an existing issue"},
      {"name": "add_issue_comment", "description": "Add a comment to an issue"},
      {"name": "search_code", "description": "Search for code across GitHub repositories"},
      {"name": "search_issues", "description": "Search for issues and pull requests"},
      {"name": "search_users", "description": "Search for GitHub users"},
      {"name": "get_issue", "description": "Get details of a specific issue"},
      {"name": "get_pull_request", "description": "Get details of a specific pull request"}
    ]'::jsonb,
    'Official MCP server for GitHub integration. Requires GITHUB_PERSONAL_ACCESS_TOKEN environment variable.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Puppeteer MCP',
    'Browser automation using Puppeteer. Navigate web pages, take screenshots, click elements, fill forms, and execute JavaScript in a real browser environment.',
    '@modelcontextprotocol/server-puppeteer',
    '1.0.0',
    'web',
    'mcp_server',
    'stdio',
    'npx',
    ARRAY['-y', '@modelcontextprotocol/server-puppeteer'],
    '[
      {"name": "puppeteer_navigate", "description": "Navigate to a URL in the browser"},
      {"name": "puppeteer_screenshot", "description": "Take a screenshot of the current page or a specific element"},
      {"name": "puppeteer_click", "description": "Click an element on the page using CSS selector"},
      {"name": "puppeteer_fill", "description": "Fill out an input field with text"},
      {"name": "puppeteer_select", "description": "Select an option from a dropdown"},
      {"name": "puppeteer_hover", "description": "Hover over an element"},
      {"name": "puppeteer_evaluate", "description": "Execute JavaScript in the browser console"}
    ]'::jsonb,
    'Official MCP server for browser automation. Enables AI to interact with web pages in a real browser.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    'Anthropic',
    true, true, NOW()
  ),
  (
    'Sequential Thinking MCP',
    'Dynamic problem-solving through thought sequences. Break down complex problems, revise thinking, branch into alternatives, and reach conclusions systematically.',
    '@modelcontextprotocol/server-sequential-thinking',
    '1.0.0',
    'general',
    'mcp_server',
    'stdio',
    'npx',
    ARRAY['-y', '@modelcontextprotocol/server-sequential-thinking'],
    '[
      {"name": "sequentialthinking", "description": "A detailed tool for dynamic and reflective problem-solving through thought sequences. Supports revising thoughts, branching into alternatives, adjusting total thoughts, and generating solution hypotheses."}
    ]'::jsonb,
    'Most popular MCP server by usage. Enables structured, step-by-step reasoning for complex problems.',
    'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    'Anthropic',
    true, true, NOW()
  )
ON CONFLICT (package_name) DO UPDATE SET
  type = EXCLUDED.type,
  mcp_transport = EXCLUDED.mcp_transport,
  mcp_command = EXCLUDED.mcp_command,
  mcp_args = EXCLUDED.mcp_args,
  mcp_tools = EXCLUDED.mcp_tools,
  updated_at = NOW();
