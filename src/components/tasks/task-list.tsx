import { useState } from 'react';
import { Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TaskItemProps {
  task: Task;
  level?: number;
}

function TaskItem({ task, level = 0 }: TaskItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasSubtasks = task.subTasks && task.subTasks.length > 0;

  return (
    <div className='space-y-2'>
      <div
        className={`flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors ${
          level === 0 ? 'bg-muted/20' : ''
        }`}
        style={{ marginLeft: `${level * 1.5}rem` }}>
        {hasSubtasks && (
          <Button
            variant='ghost'
            size='icon'
            className='h-6 w-6'
            onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? (
              <ChevronDown className='h-4 w-4' />
            ) : (
              <ChevronRight className='h-4 w-4' />
            )}
          </Button>
        )}
        <div className='flex-1'>
          <div className='flex items-center justify-between'>
            <h3 className='font-medium'>{task.title}</h3>
            <div className='flex items-center gap-2'>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  task.priority === 'High'
                    ? 'bg-destructive/20 text-destructive'
                    : task.priority === 'Medium'
                    ? 'bg-yellow-500/20 text-yellow-500'
                    : 'bg-green-500/20 text-green-500'
                }`}>
                {task.priority}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  task.status === 'ToDo'
                    ? 'bg-blue-500/20 text-blue-500'
                    : task.status === 'InProgress'
                    ? 'bg-purple-500/20 text-purple-500'
                    : 'bg-green-500/20 text-green-500'
                }`}>
                {task.status}
              </span>
            </div>
          </div>
          {task.description && (
            <p className='text-sm text-muted-foreground mt-1'>
              {task.description}
            </p>
          )}
        </div>
      </div>
      {hasSubtasks && isExpanded && (
        <div className='space-y-2'>
          {task.subTasks.map((subtask) => (
            <TaskItem key={subtask.id} task={subtask} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  return (
    <div className='space-y-4'>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}
