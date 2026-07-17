export interface BridgeCommand {
  id: string;
  command: string;
  params: Record<string, unknown>;
}

export interface MimoEvent {
  type: "step_start" | "delta" | "done" | "error" | "task_info" | "reasoning";
  text?: string;
  name?: string;
  status?: string;
  detail?: string;
  tokens?: {
    total: number;
    input: number;
    output: number;
    reasoning: number;
  };
  message?: string;
}

export interface WebImage {
  url: string;
  alt: string;
  source: string;
}

export interface ModelInfo {
  model_id: string;
  model_name: string;
  display_name: string;
  description: string;
  is_available: boolean;
  provider?: string;
}

export type ApiFormat = "chat" | "responses";

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: ApiFormat;
  models: ProviderModel[];
  status: "unknown" | "connected" | "error";
  lastChecked?: number;
}

export const MIMOCODE_PROVIDER_ID = "mimocode";

export interface ChatInfo {
  cid: string;
  title: string;
  is_pinned: boolean;
  timestamp: number;
  model?: string;
  session_id?: string;
  project_path?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thoughts?: string;
  images?: WebImage[];
  tokens?: number;
  timestamp: number;
  tasks?: TaskItem[];
}

export interface TaskItem {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  detail?: string;
  timestamp: number;
}

export type AgentAccessLevel = "full-access" | "read-only" | "sandbox";

export interface AgentConfig {
  accessLevel: AgentAccessLevel;
  systemPromptsPath: string;
  storagePath: string;
  autoReadAgentsMd: boolean;
  enableAgenticLoop: boolean;
  maxIterations: number;
}

export type AgentToolType =
  | "read_file"
  | "write_file"
  | "grep_search"
  | "shell_exec"
  | "lsp_analyze"
  | "list_files"
  | "delete_file"
  | "rename_file";

export interface AgentToolCall {
  id: string;
  tool: AgentToolType;
  args: Record<string, string>;
  result?: string;
  error?: string;
  timestamp: number;
}

export interface AgentLoopStep {
  step: number;
  observation: string;
  thought: string;
  toolCalls: AgentToolCall[];
  completed: boolean;
}

export interface AppSettings {
  selectedModel: string;
  voiceLang?: string;
  voiceModel?: string;
  mimoPath?: string;
  providers?: Provider[];
  language?: string;
  autoAcceptPermissions?: boolean;
  terminalShell?: string;
  showReasoning?: boolean;
  expandShellContextTools?: boolean;
  expandEditTools?: boolean;
  autoSave?: boolean;
  agent?: AgentConfig;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface ProjectChange {
  path: string;
  status: "added" | "modified" | "deleted";
  before: string;
  after: string;
  additions: number;
  deletions: number;
  timestamp: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  sourcePath?: string;
  workspacePath?: string;
  importedAt: number;
}

export interface ProjectInfo {
  folder: string;
  path: string;
  tree: string;
  file_count: number;
  folder_count: number;
  entries: string[];
}

export interface Workspace {
  path: string;
  name: string;
  lastOpened: number;
}

export interface TaskLogEntry {
  id: string;
  type: "info" | "running" | "success" | "error";
  message: string;
  timestamp: number;
  detail?: string;
}
