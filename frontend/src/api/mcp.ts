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
    description: 'Repositórios, pull requests, issues e workflows',
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
    description: 'Gerir issues, projetos e sprints do Jira',
    category: 'productivity',
    command: 'npx',
    args: ['-y', 'mcp-server-jira'],
    envKeys: [
      { key: 'JIRA_URL', label: 'URL do Jira', hint: 'https://empresa.atlassian.net' },
      { key: 'JIRA_EMAIL', label: 'Email', hint: 'utilizador@empresa.com' },
      { key: 'JIRA_API_TOKEN', label: 'API Token', secret: true, hint: 'id.atlassian.com → Security → API tokens' },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Ler e modificar ficheiros de design no Figma',
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
    description: 'Issues, projetos e cycles do Linear',
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
    description: 'Enviar e ler mensagens em canais do Slack',
    category: 'communication',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envKeys: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', secret: true, hint: 'Começa com xoxb- (api.slack.com/apps)' },
      { key: 'SLACK_TEAM_ID', label: 'Team ID', hint: 'Visível em api.slack.com/methods/auth.test' },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Ler e escrever páginas e bases de dados no Notion',
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
    description: 'Executar queries em bases de dados PostgreSQL',
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
    name: 'Jira (sessão corporativa)',
    description: 'Integração Jira via cookie de sessão — para instâncias sem API token',
    category: 'productivity',
    command: 'script',
    args: [],
    envKeys: [],
    scriptBased: true,
    scriptNote: 'Esta integração usa cookies de sessão guardados em /workspace/.pi/jira.env.\n\nPara renovar o cookie:\n1. Abre o Jira no browser e faz login\n2. Abre DevTools → Application → Cookies\n3. Copia os valores de JSESSIONID, atlassian.xsrf.token, INGRESSCOOKIE\n4. Pede ao agente no chat: "actualiza o cookie Jira"\n\nOs cookies ficam apenas em .pi/jira.env (gitignored). Nunca passam pela UI.',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Acesso directo a ficheiros no workspace',
    category: 'dev',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    envKeys: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
]

export const CATEGORY_LABELS: Record<McpCatalogEntry['category'], string> = {
  productivity: 'Produtividade',
  design: 'Design',
  dev: 'Desenvolvimento',
  data: 'Dados',
  communication: 'Comunicação',
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
