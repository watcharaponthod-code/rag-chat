export type Role = 'admin' | 'user' | 'dev' | 'pm' | 'qa' | 'hr' | 'ceo';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  avatarUrl: string;
}



export interface MCPConnector {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  type: 'database' | 'api' | 'files';
}

export interface ThoughtStep {
  id: string;
  icon: 'search' | 'process' | 'write' | 'secure' | 'brain' | 'list-check' | 'filter' | 'pen-tool' | 'history' | 'zap' | 'database';
  description: string;
  status: 'pending' | 'active' | 'completed';
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  sourceType?: 'file' | 'web' | 'db';
  score?: number;
}

export interface RelatedImage {
  id: string;
  url: string;
  description: string;
  refIndex?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thoughts?: ThoughtStep[];
  citations?: Citation[];
  relatedImages?: RelatedImage[];
  fileAttachment?: string;
}

export interface SessionMetrics {
  activeSessions: number;
  tokensProcessed: number;
  n8nWorkerStatus: 'healthy' | 'busy' | 'degraded';
}
