
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Volume2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onPlayAudio?: (text: string) => void;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onPlayAudio }) => {
  return (
    <div className="prose prose-indigo dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mb-4 mt-6 border-b dark:border-slate-700 pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-3 mt-5 flex items-center gap-2" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-indigo-500 dark:text-indigo-300 mb-2 mt-4" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-1 mb-4 text-slate-700 dark:text-slate-300" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 space-y-1 mb-4 text-slate-700 dark:text-slate-300" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 pl-4 py-1 italic bg-indigo-50 dark:bg-slate-700/50 rounded-r my-4 text-slate-700 dark:text-slate-300" {...props} />,
          code: ({node, className, children, ...props}) => {
             const match = /language-(\w+)/.exec(className || '')
             return !String(children).includes('\n') ? (
              <code className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            ) : (
              <pre className="bg-slate-800 dark:bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto my-3 text-sm">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
          p: ({node, ...props}) => <p className="mb-3 text-slate-700 dark:text-slate-300" {...props} />,
          strong: ({node, children, ...props}) => {
            const textContent = String(children);
            // Only show audio button for text shorter than 60 chars (likely vocabulary/idioms)
            // and if onPlayAudio is provided
            const showAudio = onPlayAudio && textContent.length < 60;
            
            if (!showAudio) {
               return <strong className="font-bold text-indigo-900 dark:text-indigo-200" {...props}>{children}</strong>;
            }

            return (
                <span 
                    className="inline-flex items-center gap-1.5 align-middle group/word cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-800/50"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPlayAudio(textContent);
                    }}
                    title="Écouter la prononciation"
                    role="button"
                >
                    <strong className="font-bold text-indigo-700 dark:text-indigo-300" {...props}>{children}</strong>
                    <Volume2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                </span>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
