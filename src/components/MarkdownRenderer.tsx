
import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Volume2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onPlayAudio?: (text: string) => void;
  highlight?: string;
}

// Helper component to highlight text
const Highlight: React.FC<{ text: string; query?: string }> = ({ text, query }) => {
  if (!query || !text) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 text-slate-900 rounded-sm px-0.5 font-medium mx-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

// Helper to recursively highlight children
const highlightChildren = (children: React.ReactNode, query?: string): React.ReactNode => {
    if (!query) return children;

    return React.Children.map(children, (child) => {
        if (typeof child === 'string') {
            return <Highlight text={child} query={query} />;
        }
        if (React.isValidElement(child)) {
             // @ts-ignore - cloning element to process its children
            return React.cloneElement(child, {
                // @ts-ignore
                children: highlightChildren(child.props.children, query)
            });
        }
        return child;
    });
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onPlayAudio, highlight }) => {
  
  const processNode = (node: any, props: any, Tag: any) => {
      const { children, ...rest } = props;
      return <Tag {...rest}>{highlightChildren(children, highlight)}</Tag>;
  };

  return (
    <div className="prose prose-indigo dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:marker:text-indigo-500 dark:prose-li:marker:text-indigo-400">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => processNode(props.node, props, ({children, ...rest}: any) => <h1 className="text-xl md:text-2xl font-bold text-indigo-700 dark:text-indigo-400 mb-3 mt-5 border-b dark:border-slate-700 pb-2" {...rest}>{children}</h1>),
          h2: (props) => processNode(props.node, props, ({children, ...rest}: any) => <h2 className="text-lg md:text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 mt-4 flex items-center gap-2" {...rest}>{children}</h2>),
          h3: (props) => processNode(props.node, props, ({children, ...rest}: any) => <h3 className="text-base md:text-lg font-semibold text-indigo-500 dark:text-indigo-300 mb-2 mt-3" {...rest}>{children}</h3>),
          ul: (props) => processNode(props.node, props, ({children, ...rest}: any) => <ul className="list-disc list-outside ml-4 space-y-1 mb-3 text-slate-700 dark:text-slate-300" {...rest}>{children}</ul>),
          ol: (props) => processNode(props.node, props, ({children, ...rest}: any) => <ol className="list-decimal list-outside ml-4 space-y-1 mb-3 text-slate-700 dark:text-slate-300" {...rest}>{children}</ol>),
          li: (props) => processNode(props.node, props, ({children, ...rest}: any) => <li className="pl-1 leading-relaxed" {...rest}>{children}</li>),
          blockquote: (props) => processNode(props.node, props, ({children, ...rest}: any) => <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 pl-4 py-1 italic bg-indigo-50 dark:bg-slate-700/30 rounded-r my-3 text-slate-700 dark:text-slate-300" {...rest}>{children}</blockquote>),
          table: (props) => <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 dark:border-slate-700"><table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700" {...props} /></div>,
          thead: (props) => <thead className="bg-slate-50 dark:bg-slate-800" {...props} />,
          th: (props) => <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider" {...props} />,
          td: (props) => <td className="px-3 py-2 whitespace-normal text-sm text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-700" {...props} />,
          code: ({node, className, children, ...props}) => {
             const match = /language-(\w+)/.exec(className || '')
             const isInline = !String(children).includes('\n');
             return isInline ? (
              <code className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded text-sm font-mono break-words" {...props}>
                {highlight ? <Highlight text={String(children)} query={highlight} /> : children}
              </code>
            ) : (
              <pre className="bg-slate-800 dark:bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto my-3 text-sm border border-slate-700">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          },
          p: (props) => processNode(props.node, props, ({children, ...rest}: any) => <p className="mb-2 text-slate-700 dark:text-slate-300 leading-relaxed" {...rest}>{children}</p>),
          strong: ({node, children, ...props}) => {
            const textContent = String(children);
            const showAudio = onPlayAudio && textContent.length < 60;
            const content = highlight ? <Highlight text={textContent} query={highlight} /> : children;

            if (!showAudio) {
               return <strong className="font-bold text-indigo-900 dark:text-indigo-200" {...props}>{content}</strong>;
            }

            return (
                <span 
                    className="inline-flex items-center gap-1.5 align-baseline group/word cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-800/50"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPlayAudio(textContent);
                    }}
                    title="Écouter la prononciation"
                    role="button"
                >
                    <strong className="font-bold text-indigo-700 dark:text-indigo-300" {...props}>{content}</strong>
                    <Volume2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 opacity-70 group-hover/word:opacity-100" />
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

// Optimization: Only re-render if content or highlight changes substantially
export default memo(MarkdownRenderer, (prev, next) => {
    return prev.content === next.content && prev.highlight === next.highlight;
});
