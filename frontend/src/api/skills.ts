import { apiGet } from './client'

export interface Skill {
  name: string
  description: string
  command: string
  source?: string
}

export async function getSkills(): Promise<Skill[]> {
  try {
    const data = await apiGet<{ commands: Array<{ name: string; description: string; source: string }> }>('/agent/commands')
    const commands = Array.isArray(data?.commands) ? data.commands : []
    return commands
      .filter((c) => c.source === 'skill')
      .map((c) => ({
        name: c.name.replace(/^\/skill:/, ''),
        description: c.description,
        command: c.name,
        source: c.source,
      }))
  } catch {
    return []
  }
}

export async function getAllCommands(): Promise<Skill[]> {
  try {
    const data = await apiGet<{ commands: Array<{ name: string; description: string; source: string }> }>('/agent/commands')
    const commands = Array.isArray(data?.commands) ? data.commands : []
    return commands.map((c) => ({
      name: c.name,
      description: c.description,
      command: c.name,
      source: c.source,
    }))
  } catch {
    return []
  }
}
