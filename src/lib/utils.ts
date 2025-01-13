import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Task } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix: string = 'TASK'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export function findTaskById(tasks: Task[], id: string): Task | null {
  for (const task of tasks) {
    if (task.id === id) return task;
    if (task.subTasks.length > 0) {
      const found = findTaskById(task.subTasks, id);
      if (found) return found;
    }
  }
  return null;
}

export function updateTaskInTree(tasks: Task[], updatedTask: Task): Task[] {
  return tasks.map((task) => {
    if (task.id === updatedTask.id) {
      return { ...task, ...updatedTask };
    }
    if (task.subTasks.length > 0) {
      return {
        ...task,
        subTasks: updateTaskInTree(task.subTasks, updatedTask),
      };
    }
    return task;
  });
}

export function deleteTaskFromTree(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((task) => {
    if (task.id === taskId) {
      return false;
    }
    if (task.subTasks.length > 0) {
      task.subTasks = deleteTaskFromTree(task.subTasks, taskId);
    }
    return true;
  });
}
