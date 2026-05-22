import { readFile } from './files'

export interface StackState {
  project_name: string
  drupal_url?: string
  db_type?: string
  workspace_id?: string
}

export async function getStackState(): Promise<StackState | null> {
  try {
    const raw = await readFile('.piclaw/stack/state.json')
    if (!raw) return null
    return JSON.parse(raw) as StackState
  } catch {
    return null
  }
}
