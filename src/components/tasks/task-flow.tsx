'use client';

import { useEffect, useState, useRef } from 'react';
import { Task } from '@/lib/types';
import mermaid from 'mermaid';
import { Button } from '@/components/ui/button';
import {
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  RotateCcw,
} from 'lucide-react';

interface TaskFlowProps {
  tasks: Task[];
}

interface Position {
  x: number;
  y: number;
}

const MermaidDiagram = ({ chart }: { chart: string }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initAndRender = async () => {
      if (!elementRef.current) return;

      try {
        // Initialize with specific config
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          flowchart: {
            curve: 'linear',
            padding: 30,
            nodeSpacing: 80,
            rankSpacing: 100,
            htmlLabels: true,
          },
        });

        // Create a unique ID for this render
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;

        // Create a temporary container
        const tempContainer = document.createElement('div');
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);

        try {
          // Render to temporary container first
          const { svg } = await mermaid.render(id, chart);

          // Only update if component is still mounted
          if (mounted && elementRef.current) {
            elementRef.current.innerHTML = svg;

            // Find and modify the SVG element
            const svgElement = elementRef.current.querySelector('svg');
            if (svgElement) {
              svgElement.style.width = '100%';
              svgElement.style.height = '100%';
              svgElement.style.maxWidth = '100%';
              svgElement.style.maxHeight = '100%';
            }
            setError(null);
          }
        } finally {
          // Clean up temporary container
          document.body.removeChild(tempContainer);
        }
      } catch (error) {
        console.error('Error rendering diagram:', error);
        if (mounted) {
          setError(
            'Failed to render diagram. Please check the diagram syntax.'
          );
        }
      }
    };

    // Add a small delay to ensure the DOM is ready
    const timeoutId = setTimeout(initAndRender, 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [chart, key]);

  // Re-render on resize with debounce
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setKey((k) => k + 1), 250);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className='w-full h-full flex items-center justify-center'>
      {error ? (
        <div className='text-red-500 text-sm'>{error}</div>
      ) : (
        <div
          ref={elementRef}
          key={key}
          className='w-full h-full flex items-center justify-center'
        />
      )}
    </div>
  );
};

export function TaskFlow({ tasks }: TaskFlowProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPosition = useRef<Position>({ x: 0, y: 0 });
  const lastPinchDistance = useRef<number>(0);

  // Generate Mermaid diagram definition
  const generateDiagram = () => {
    let diagram = 'graph TD\n';

    // Add main task nodes
    tasks.forEach((task, index) => {
      const taskId = `task${index}`;
      const cleanTitle = task.title.replace(/[^a-zA-Z0-9\s]/g, ' ');

      // Create main task node with status
      diagram += `  ${taskId}["${cleanTitle}<br/>${task.status}"]\n`;
      diagram += `  style ${taskId} fill:#1e293b,stroke:${
        task.priority === 'High'
          ? '#ff6161'
          : task.priority === 'Medium'
          ? '#ffd700'
          : '#4caf50'
      },color:#fff,rx:10,ry:10\n`;

      // Add subtask nodes
      task.subTasks.forEach((subtask, subIndex) => {
        const subtaskId = `${taskId}_sub${subIndex}`;
        const cleanSubtaskTitle = subtask.title.replace(/[^a-zA-Z0-9\s]/g, ' ');

        // Create subtask node with status
        diagram += `  ${subtaskId}["${cleanSubtaskTitle}<br/>${subtask.status}"]\n`;
        diagram += `  style ${subtaskId} fill:#1e293b,stroke:${
          subtask.priority === 'High'
            ? '#ff6161'
            : subtask.priority === 'Medium'
            ? '#ffd700'
            : '#4caf50'
        },color:#fff,rx:8,ry:8\n`;
        diagram += `  ${taskId} --> ${subtaskId}\n`;
      });

      // Connect main tasks in sequence
      if (index < tasks.length - 1) {
        diagram += `  ${taskId} --> task${index + 1}\n`;
      }
    });

    return diagram;
  };

  useEffect(() => {
    // Add non-passive wheel event listener
    const element = containerRef.current;
    if (!element) return;

    const handleWheelEvent = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.01;
        setZoom((prev) => Math.min(Math.max(prev + delta, 0.5), 2));
      }
    };

    element.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  // Handle mouse and touch events for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isPanning) return;
    isDragging.current = true;
    lastPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastPosition.current.x;
    const deltaY = e.clientY - lastPosition.current.y;
    setPosition((prev) => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY,
    }));
    lastPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Handle touch events for panning and pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastPinchDistance.current = distance;
    } else if (e.touches.length === 1 && isPanning) {
      // Single touch pan
      isDragging.current = true;
      lastPosition.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance - lastPinchDistance.current;
      const newZoom = zoom + delta * 0.01;
      setZoom(Math.min(Math.max(newZoom, 0.5), 2));
      lastPinchDistance.current = distance;
    } else if (e.touches.length === 1 && isDragging.current) {
      // Single touch pan
      const deltaX = e.touches[0].clientX - lastPosition.current.x;
      const deltaY = e.touches[0].clientY - lastPosition.current.y;
      setPosition((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      lastPosition.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    lastPinchDistance.current = 0;
  };

  const resetView = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  };

  const togglePanning = () => {
    setIsPanning(!isPanning);
  };

  const DiagramContainer = () => (
    <div
      ref={containerRef}
      className={`relative ${isPanning ? 'cursor-move' : ''}`}
      style={{
        transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`,
        transformOrigin: 'center center',
        transition: 'transform 0.1s ease-out',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}>
      <MermaidDiagram chart={generateDiagram()} />
    </div>
  );

  const ZoomControls = () => (
    <div className='absolute bottom-4 right-4 flex gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-lg border border-border'>
      <Button
        variant='ghost'
        size='icon'
        onClick={handleZoomIn}
        className='hover:bg-accent'>
        <ZoomIn className='h-4 w-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        onClick={handleZoomOut}
        className='hover:bg-accent'>
        <ZoomOut className='h-4 w-4' />
      </Button>
      <Button
        variant={isPanning ? 'secondary' : 'ghost'}
        size='icon'
        onClick={togglePanning}
        className='hover:bg-accent'>
        <MoveHorizontal className='h-4 w-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        onClick={resetView}
        className='hover:bg-accent'>
        <RotateCcw className='h-4 w-4' />
      </Button>
    </div>
  );

  return (
    <>
      <div className='w-full h-full flex flex-col'>
        <div className='flex justify-end mb-2'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setIsFullScreen(true)}
            className='hover:bg-accent'>
            <Maximize2 className='h-4 w-4' />
          </Button>
        </div>
        <div className='flex-1 overflow-hidden p-4 relative'>
          <DiagramContainer />
          <ZoomControls />
        </div>
      </div>

      {/* Full Screen Modal */}
      {isFullScreen && (
        <div className='fixed inset-0 bg-background z-50 flex flex-col'>
          <div className='flex justify-between items-center p-4 border-b'>
            <h2 className='text-lg font-semibold'>Task Flow Diagram</h2>
            <Button
              variant='ghost'
              size='icon'
              onClick={() => setIsFullScreen(false)}
              className='hover:bg-accent'>
              <X className='h-4 w-4' />
            </Button>
          </div>
          <div className='flex-1 overflow-hidden p-8 relative'>
            <DiagramContainer />
            <ZoomControls />
          </div>
        </div>
      )}
    </>
  );
}
