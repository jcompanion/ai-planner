import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ListChecks, GitPullRequest, Activity } from 'lucide-react';
import mermaid from 'mermaid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import type { Components } from 'react-markdown';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

interface QuestionListProps {
  questions: string[];
}

const QuestionList = ({ questions }: QuestionListProps) => {
  return (
    <div className='bg-card border border-border rounded-lg p-4 space-y-3'>
      <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2'>
        <ListChecks className='h-4 w-4' />
        <span>Please answer these questions:</span>
      </div>
      <div className='space-y-2'>
        {questions.map((question, index) => (
          <div key={index} className='flex gap-3'>
            <span className='text-sm font-medium text-primary'>
              {index + 1}.
            </span>
            <p className='text-sm'>{question}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TaskSummaryProps {
  content: string;
}

const TaskSummary = ({ content }: TaskSummaryProps) => {
  return (
    <div className='bg-card border border-border rounded-lg p-4 space-y-3'>
      <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2'>
        <GitPullRequest className='h-4 w-4' />
        <span>Tasks Created</span>
      </div>
      <div className='text-sm text-muted-foreground'>
        Tasks have been created and added to your task list.
      </div>
    </div>
  );
};

interface DiagramViewProps {
  diagram: string;
}

const DiagramView = ({ diagram }: DiagramViewProps) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initDiagram = async () => {
      if (!elementRef.current) return;

      try {
        await mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          flowchart: {
            curve: 'linear',
            padding: 20,
          },
        });

        const { svg } = await mermaid.render(
          'diagram-' + Math.random().toString(36).slice(2),
          diagram
        );

        if (elementRef.current) {
          elementRef.current.innerHTML = svg;
        }
      } catch (e) {
        console.error('Error rendering diagram:', e);
        setError('Failed to render diagram');
      }
    };

    initDiagram();
  }, [diagram]);

  return (
    <div className='bg-card border border-border rounded-lg p-4 space-y-3'>
      <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2'>
        <Activity className='h-4 w-4' />
        <span>Project Structure</span>
      </div>
      {error ? (
        <div className='text-sm text-red-500'>{error}</div>
      ) : (
        <div ref={elementRef} className='w-full overflow-auto' />
      )}
    </div>
  );
};

const MarkdownContent = ({ content }: { content: string }) => {
  const components: Components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag='div'
          {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    a: ({ children, ...props }) => (
      <a
        className='text-primary hover:underline'
        target='_blank'
        rel='noopener noreferrer'
        {...props}>
        {children}
      </a>
    ),
    table: ({ children, ...props }) => (
      <div className='my-4 w-full overflow-y-auto'>
        <table className='w-full border-collapse' {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th
        className='border border-border bg-muted px-4 py-2 text-left font-semibold'
        {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className='border border-border px-4 py-2' {...props}>
        {children}
      </td>
    ),
  };

  return (
    <ReactMarkdown
      className='prose prose-invert max-w-none'
      remarkPlugins={[remarkGfm]}
      components={components}>
      {content}
    </ReactMarkdown>
  );
};

const MessageContent = ({ message }: { message: ChatMessage }) => {
  // Extract questions from the message content if present
  const questionsMatch = message.content.match(
    /QUESTIONS_START\n([\s\S]*?)\nQUESTIONS_END/
  );
  const questions = questionsMatch
    ? questionsMatch[1]
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          // Remove number prefix and clean up
          return line.replace(/^\d+\.\s*/, '').trim();
        })
    : null;

  // Extract diagram if present
  const diagramMatch = message.content.match(
    /DIAGRAM_START\n([\s\S]*?)\nDIAGRAM_END/
  );
  const diagram = diagramMatch ? diagramMatch[1].trim() : null;

  // Check if content contains tasks
  const hasTasks =
    message.content.includes('TASKS_START') &&
    message.content.includes('TASKS_END');

  if (message.role === 'user') {
    return <p className='whitespace-pre-wrap'>{message.content}</p>;
  }

  // Clean the displayed content by removing the special sections
  let displayContent = message.content
    .replace(/QUESTIONS_START\n[\s\S]*?QUESTIONS_END/, '')
    .replace(/TASKS_START\n[\s\S]*?TASKS_END/, '')
    .replace(/DIAGRAM_START\n[\s\S]*?DIAGRAM_END/, '')
    .trim();

  return (
    <div className='space-y-4'>
      {questions && <QuestionList questions={questions} />}

      {displayContent && <MarkdownContent content={displayContent} />}

      {hasTasks && message.status !== 'creating-tasks' && (
        <TaskSummary content={message.content} />
      )}

      {diagram && <DiagramView diagram={diagram} />}

      {message.status === 'streaming' && (
        <div className='flex items-center space-x-2 h-4'>
          <div className='w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce' />
          <div className='w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce delay-100' />
          <div className='w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce delay-200' />
        </div>
      )}
      {message.status === 'creating-tasks' && (
        <div className='flex items-center space-x-2 text-xs text-muted-foreground'>
          <Loader2 className='h-3 w-3 animate-spin' />
          <span>Creating tasks...</span>
        </div>
      )}
      {message.status === 'error' && (
        <div className='text-xs text-red-500'>
          Error: Failed to process the request
        </div>
      )}
    </div>
  );
};

export function ChatInterface({
  messages,
  onSendMessage,
  isLoading,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className='flex flex-col h-full'>
      <ScrollArea className='flex-1 p-4'>
        <div className='space-y-4'>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}>
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                <MessageContent message={message} />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <form onSubmit={handleSubmit} className='p-4 border-t border-border'>
        <div className='flex space-x-2'>
          <Input
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setInput(e.target.value)
            }
            placeholder='Type your message...'
            disabled={isLoading}
            className='flex-1'
          />
          <Button type='submit' disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
