'use client';

import { ChatInterface } from '@/components/chat/chat-interface';
import { TaskList } from '@/components/tasks/task-list';
import { useState } from 'react';
import { ChatMessage, Task } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileJson, Download } from 'lucide-react';
import { TaskFlow } from '@/components/tasks/task-flow';
import mermaid from 'mermaid';
import JSZip from 'jszip';

export default function Dashboard() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const generateNotionExport = async () => {
    // Function to convert Mermaid diagram to SVG and save to zip
    const convertDiagramToSvg = async (
      diagram: string,
      filename: string,
      zip: JSZip
    ) => {
      try {
        await mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          flowchart: {
            curve: 'linear',
            padding: 30,
          },
        });

        const { svg } = await mermaid.render(
          'diagram-' + Math.random().toString(36).slice(2),
          diagram
        );

        // Add SVG to zip file
        zip.file(`diagrams/${filename}.svg`, svg);
        return `diagrams/${filename}.svg`;
      } catch (error) {
        console.error('Error converting diagram:', error);
        return null;
      }
    };

    // Create a new ZIP archive
    const zip = new JSZip();
    const diagramsFolder = zip.folder('diagrams');

    // Define CSV headers for Notion database
    const headers = [
      'Name',
      'Status',
      'Priority',
      'Description',
      'Parent Task',
      'Type',
      'Tags',
      'Step Number',
      'Flow Diagram',
      'Wireframe',
    ].join(',');

    // Generate and convert flow diagram for all tasks
    const flowDiagram = `graph TB
      ${tasks
        .map((task, index) => {
          const cleanTitle = task.title.replace(/[^a-zA-Z0-9\s]/g, ' ');
          return `Step${index + 1}["${cleanTitle}"]`;
        })
        .join('\n      ')}
      ${tasks
        .slice(0, -1)
        .map((_, index) => `Step${index + 1} --> Step${index + 2}`)
        .join('\n      ')}`;

    const mainFlowPath = await convertDiagramToSvg(
      flowDiagram,
      'main-flow',
      zip
    );

    // Convert tasks to CSV rows
    const rows = await Promise.all(
      tasks.flatMap(async (task, index) => {
        // Generate subtask diagram if there are subtasks
        const subtaskDiagram =
          task.subTasks.length > 0
            ? `graph TB
          Main["${task.title}"]
          ${task.subTasks
            .map((subtask, subIndex) => {
              const cleanTitle = subtask.title.replace(/[^a-zA-Z0-9\s]/g, ' ');
              return `Sub${subIndex + 1}["${cleanTitle}"]
          Main --> Sub${subIndex + 1}`;
            })
            .join('\n          ')}`
            : '';

        const subtaskPath = subtaskDiagram
          ? await convertDiagramToSvg(subtaskDiagram, `subtask-${task.id}`, zip)
          : null;

        // Main task row
        const mainTask = [
          `"${task.title}"`,
          `"${task.status}"`,
          `"${task.priority}"`,
          `"${task.description}"`,
          '""', // No parent for main tasks
          '"Main Task"',
          `"${task.priority},Task"`,
          `"${index + 1}"`,
          `"${mainFlowPath || ''}"`, // Reference to diagram file
          '""', // Placeholder for wireframe
        ].join(',');

        // Subtask rows
        const subtasks = await Promise.all(
          task.subTasks.map(async (subtask, subIndex) =>
            [
              `"${subtask.title}"`,
              `"${subtask.status}"`,
              `"${subtask.priority}"`,
              `"${subtask.description}"`,
              `"${task.title}"`,
              '"Subtask"',
              `"${subtask.priority},Subtask"`,
              `"${index + 1}.${subIndex + 1}"`,
              `"${subtaskPath || ''}"`, // Reference to subtask diagram file
              '""', // Placeholder for wireframe
            ].join(',')
          )
        );

        return [mainTask, ...subtasks];
      })
    );

    // Add CSV file to zip
    const csv = [headers, ...rows.flat()].join('\n');
    zip.file('notion-tasks.csv', csv);

    // Add README with instructions
    const readme = `# Task Export for Notion

This ZIP archive contains:
1. notion-tasks.csv - Import this file into Notion
2. diagrams/ - SVG files for task flow visualizations

To use in Notion:
1. Create a new database
2. Import the CSV file
3. Upload the diagram SVGs as attachments
4. Link diagrams to their respective tasks

For questions or issues, please contact support.`;

    zip.file('README.md', readme);

    return zip;
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const zip = await generateNotionExport();
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'notion-export.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    setIsLoading(true);
    // Add user message
    const userMessage: ChatMessage = {
      id: generateId('MSG'),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create a new message for streaming content
    const streamingMessage: ChatMessage = {
      id: generateId('MSG'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };
    setMessages((prev) => [...prev, streamingMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Use the native EventSource API for better SSE handling
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let buffer = '';
      let isParsingTasks = false;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('Stream complete');
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'content') {
                  // Update streaming message content
                  setMessages((prev) => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage.role === 'assistant') {
                      const newContent = lastMessage.content + data.content;

                      // Check for task markers
                      if (
                        newContent.includes('TASKS_START') &&
                        !isParsingTasks
                      ) {
                        console.log('Task section detected');
                        isParsingTasks = true;
                        return [
                          ...prev.slice(0, -1),
                          {
                            ...lastMessage,
                            content: newContent,
                            status: 'creating-tasks',
                          },
                        ];
                      }

                      return [
                        ...prev.slice(0, -1),
                        { ...lastMessage, content: newContent },
                      ];
                    }
                    return prev;
                  });
                } else if (data.type === 'tasks') {
                  console.log('Processing tasks:', data.tasks);
                  // Update tasks - replace all if replaceAll flag is true
                  setTasks((prev) => {
                    if (data.replaceAll) {
                      console.log('Replacing all tasks with:', data.tasks);
                      return data.tasks;
                    }
                    // Otherwise merge with existing tasks
                    const existingIds = new Set(prev.map((task) => task.id));
                    const newTasks = data.tasks.filter(
                      (task: Task) => !existingIds.has(task.id)
                    );
                    return [...prev, ...newTasks];
                  });

                  // Update message status
                  setMessages((prev) => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage.role === 'assistant') {
                      return [
                        ...prev.slice(0, -1),
                        { ...lastMessage, status: 'completed' },
                      ];
                    }
                    return prev;
                  });

                  isParsingTasks = false;
                } else if (data.type === 'done') {
                  console.log('Stream finished');
                }
              } catch (e) {
                console.error('Error parsing data:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Error:', error);
      // Add error message
      const errorMessage: ChatMessage = {
        id: generateId('MSG'),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        timestamp: Date.now(),
        status: 'error',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <main className='container mx-auto p-4 h-screen'>
        <div className='flex justify-end mb-4 gap-2'>
          <Button
            onClick={handleExport}
            className='gap-2'
            variant='outline'
            disabled={isExporting}>
            <Download className='h-4 w-4' />
            {isExporting ? 'Exporting...' : 'Export to Notion'}
          </Button>
        </div>
        <div className='grid grid-cols-12 gap-4 h-[calc(100vh-5rem)]'>
          {/* Chat Interface */}
          <div className='col-span-4 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col'>
            <div className='p-4 border-b border-border'>
              <h2 className='text-lg font-semibold'>Chat</h2>
            </div>
            <div className='flex-1 overflow-hidden'>
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Task List */}
          <div className='col-span-4 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col'>
            <div className='p-4 border-b border-border'>
              <h2 className='text-lg font-semibold'>Tasks</h2>
            </div>
            <div className='flex-1 overflow-auto p-4'>
              <TaskList tasks={tasks} />
            </div>
          </div>

          {/* Task Flow Visualization */}
          <div className='col-span-4 bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col'>
            <div className='p-4 border-b border-border'>
              <h2 className='text-lg font-semibold'>Task Flow</h2>
            </div>
            <div className='flex-1 overflow-auto p-4'>
              <TaskFlow tasks={tasks} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
