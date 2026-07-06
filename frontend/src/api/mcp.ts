import { apiGet, apiPut } from './client'
import { runWorkspaceCommand } from './bash'

export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export interface McpEnvKey {
  key: string
  label: string
  secret?: boolean
  hint?: string
}

export interface McpCatalogEntry {
  id: string
  name: string
  description: string
  category: 'productivity' | 'design' | 'dev' | 'data' | 'communication'
  command: string
  args: string[]
  envKeys: McpEnvKey[]
  docsUrl?: string
  scriptBased?: boolean   // integration via scripts/curl, not a real MCP server
  scriptNote?: string     // shown in the info modal instead of credential form
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, pull requests, issues and workflows',
    category: 'dev',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'Personal Access Token', secret: true, hint: 'github.com → Settings → Developer settings → Personal access tokens' },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Manage Jira issues, projects and sprints',
    category: 'productivity',
    command: 'npx',
    args: ['-y', 'mcp-server-jira'],
    envKeys: [
      { key: 'JIRA_URL', label: 'Jira URL', hint: 'https://company.atlassian.net' },
      { key: 'JIRA_EMAIL', label: 'Email', hint: 'user@company.com' },
      { key: 'JIRA_API_TOKEN', label: 'API Token', secret: true, hint: 'id.atlassian.com → Security → API tokens' },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Read and modify design files in Figma',
    category: 'design',
    command: 'npx',
    args: ['-y', 'figma-mcp'],
    envKeys: [
      { key: 'FIGMA_ACCESS_TOKEN', label: 'Access Token', secret: true, hint: 'figma.com → Account Settings → Personal access tokens' },
    ],
    docsUrl: 'https://www.figma.com/developers/api',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Linear issues, projects and cycles',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@linear/mcp-server-linear'],
    envKeys: [
      { key: 'LINEAR_API_KEY', label: 'API Key', secret: true, hint: 'linear.app → Settings → API → Personal API keys' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send and read messages in Slack channels',
    category: 'communication',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envKeys: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', secret: true, hint: 'Starts with xoxb- (api.slack.com/apps)' },
      { key: 'SLACK_TEAM_ID', label: 'Team ID', hint: 'Visible at api.slack.com/methods/auth.test' },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write pages and databases in Notion',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envKeys: [
      { key: 'NOTION_API_KEY', label: 'Integration Token', secret: true, hint: 'notion.so/my-integrations → New integration' },
    ],
    docsUrl: 'https://developers.notion.com/docs/mcp',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Run queries against PostgreSQL databases',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', '{{POSTGRES_URL}}'],
    envKeys: [
      { key: 'POSTGRES_URL', label: 'Connection URL', secret: true, hint: 'postgresql://user:pass@host:5432/db' },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
  },
  {
    id: 'jira-cookie',
    name: 'Jira (corporate session)',
    description: 'Jira integration via session cookie — for instances without an API token',
    category: 'productivity',
    command: 'script',
    args: [],
    envKeys: [],
    scriptBased: true,
    scriptNote: 'This integration uses session cookies stored in /workspace/.pi/jira.env.\n\nTo renew the cookie:\n1. Open Jira in the browser and log in\n2. Open DevTools → Application → Cookies\n3. Copy the values of JSESSIONID, atlassian.xsrf.token, INGRESSCOOKIE\n4. Ask the agent in chat: "update the Jira cookie"\n\nCookies are stored only in .pi/jira.env (gitignored). They never pass through the UI.',
  },
  {
    id: 'gitnexus',
    name: 'GitNexus',
    description: 'Code intelligence index — query symbol relationships, call graphs and blast radius',
    category: 'dev',
    command: 'npx',
    args: ['-y', 'gitnexus@latest', 'mcp'],
    envKeys: [],
    docsUrl: 'https://github.com/abhigyanpatwari/GitNexus',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Direct access to files in the workspace',
    category: 'dev',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    envKeys: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
]

export const CATEGORY_LABELS: Record<McpCatalogEntry['category'], string> = {
  productivity: 'Productivity',
  design: 'Design',
  dev: 'Development',
  data: 'Data',
  communication: 'Communication',
}

const MCP_PATH = '.pi/mcp.json'

export async function loadMcpConfig(): Promise<McpConfig> {
  try {
    const envelope = await apiGet<{ text: string }>(
      `/workspace/file?path=${encodeURIComponent(MCP_PATH)}`
    )
    return JSON.parse(envelope.text) as McpConfig
  } catch {
    return { mcpServers: {} }
  }
}

async function saveMcpConfig(config: McpConfig): Promise<void> {
  const content = JSON.stringify(config, null, 2)
  try {
    await apiPut('/workspace/file', { path: MCP_PATH, content })
  } catch {
    const b64 = btoa(unescape(encodeURIComponent(content)))
    await runWorkspaceCommand(
      `mkdir -p /workspace/.pi && printf '%s' '${b64}' | base64 -d > /workspace/.pi/mcp.json`
    )
  }
}

export async function addMcpServer(id: string, config: McpServerConfig): Promise<void> {
  const current = await loadMcpConfig()
  current.mcpServers[id] = config
  await saveMcpConfig(current)
}

export async function removeMcpServer(id: string): Promise<void> {
  const current = await loadMcpConfig()
  delete current.mcpServers[id]
  await saveMcpConfig(current)
}
