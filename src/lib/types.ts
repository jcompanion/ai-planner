export type TaskStatus = 'ToDo' | 'InProgress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  diagram?: string; // Mermaid diagram code
  subTasks: Task[];
  parentId?: string;
}

export type MessageStatus =
  | 'streaming'
  | 'creating-tasks'
  | 'completed'
  | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: MessageStatus;
}

export interface ChatState {
  messages: ChatMessage[];
  tasks: Task[];
  isLoading: boolean;
}
