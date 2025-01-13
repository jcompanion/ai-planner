import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { ChatMessage, Task } from '@/lib/types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a project planning assistant. Your role is to help users break down their projects into structured tasks and subtasks.

When users first describe their project, start by asking key questions about:
1. Project goals and objectives
2. Target audience/users
3. Technical requirements (frameworks, languages, etc.)
4. Design preferences and inspiration
5. Timeline and constraints
6. Must-have features vs nice-to-have

If the answers are in the prompt only ask questions if you are not sure.

After gathering requirements, you should:
1. Break it down into clear, actionable tasks in as much detail as possible
2. Create subtasks where appropriate
3. Set reasonable priorities
4. Generate visual aids:
   - Mermaid mindmaps for project structure
   - Mermaid flowcharts for user flows
   - ASCII wireframes for UI-related tasks
   - Sequence diagrams for complex interactions

Please format your responses in a clear, structured way:

For initial questions, use:
QUESTIONS_START
[Your questions here]
QUESTIONS_END

For tasks, use this JSON format:
{
  "id": "TASK-001",
  "title": "Task Title",
  "description": "Task Description",
  "status": "ToDo",
  "priority": "High",
  "subTasks": []
}

Always wrap task lists with:
TASKS_START
[
  {
    "id": "TASK-001",
    "title": "First Task",
    "description": "Description",
    "status": "ToDo",
    "priority": "High",
    "subTasks": []
  }
]
TASKS_END

For mindmaps/diagrams, wrap with:
DIAGRAM_START
[mermaid diagram here]
DIAGRAM_END

For wireframes, wrap with:
WIREFRAME_START
[ASCII wireframe here]
WIREFRAME_END`;

function extractTasksFromMessage(message: string): Task[] {
  try {
    // Look for tasks between TASKS_START and TASKS_END markers
    const tasksMatch = message.match(/TASKS_START\s*([\s\S]*?)\s*TASKS_END/);
    if (tasksMatch && tasksMatch[1]) {
      const tasksJson = tasksMatch[1].trim();
      const tasks = JSON.parse(tasksJson);
      if (Array.isArray(tasks)) {
        return tasks;
      }
    }

    // Fallback: try to find any JSON arrays in the message
    const arrayMatch = message.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      const tasks = JSON.parse(arrayMatch[0]);
      if (Array.isArray(tasks)) {
        return tasks;
      }
    }

    // Fallback: look for individual task objects
    const taskMatches = message.match(/\{[^{}]*"id":[^{}]*\}/g);
    if (taskMatches) {
      return taskMatches
        .map((match) => {
          try {
            return JSON.parse(match);
          } catch (e) {
            console.error('Error parsing individual task:', e);
            return null;
          }
        })
        .filter((task): task is Task => task !== null);
    }

    return [];
  } catch (error) {
    console.error('Error extracting tasks:', error);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Create streaming completion
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((msg: ChatMessage) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
    });

    // Create a new TransformStream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Process the stream
    (async () => {
      try {
        let buffer = '';
        let tasksStarted = false;

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';

          if (content) {
            buffer += content;

            // Send the content chunk
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'content', content })}\n\n`
              )
            );

            // Check for task markers
            if (buffer.includes('TASKS_START') && !tasksStarted) {
              tasksStarted = true;
              console.log('Tasks section started');
            }

            if (buffer.includes('TASKS_END') && tasksStarted) {
              const tasksMatch = buffer.match(
                /TASKS_START\s*([\s\S]*?)\s*TASKS_END/
              );
              if (tasksMatch && tasksMatch[1]) {
                try {
                  const tasks = JSON.parse(tasksMatch[1].trim());
                  // Send tasks with replaceAll flag to indicate this is a full task list
                  await writer.write(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'tasks',
                        tasks,
                        replaceAll: true,
                      })}\n\n`
                    )
                  );
                  tasksStarted = false;
                } catch (e) {
                  console.error('Error parsing tasks:', e);
                }
              }
            }
          }
        }

        // Send completion message
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
      } catch (error) {
        console.error('Stream processing error:', error);
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process the request' },
      { status: 500 }
    );
  }
}
