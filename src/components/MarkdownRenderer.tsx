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
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onPlayAudio, highlight }) => {
  return (
    <div className="prose prose-indigo dark:prose-invert max-w-none 
                    prose-p:leading-relaxed prose-p:my-1.5
                    prose-headings:font-black prose-headings:tracking-tight
                    prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({children}) => <h1 className="text-lg md:text-xl font-black text-indigo-700 dark:text-indigo-400 mb-2 mt-4">{children}</h1>,
          h2: ({children}) => <h2 className="text-base md:text-lg font-black text-indigo-600 dark:text-indigo-400 mb-2 mt-4">{children}</h2>,
          h3: ({children}) => <h3 className="text-sm md:text-base font-bold text-indigo-500 dark:text-indigo-300 mb-1 mt-3">{children}</h3>,
          ul: ({children}) => <ul className="list-disc list-outside ml-4 space-y-1 mb-3 text-slate-700 dark:text-slate-300">{children}</ul>,
          ol: ({children}) => <ol className="list-decimal list-outside ml-4 space-y-1 mb-3 text-slate-700 dark:text-slate-300">{children}</ol>,
          li: ({children}) => <li className="pl-1 text-sm md:text-base leading-relaxed">{children}</li>,
          blockquote: ({children}) => <blockquote className="border-l-4 border-indigo-200 dark:border-indigo-800 pl-4 py-1 italic bg-indigo-50/50 dark:bg-slate-700/30 rounded-r my-3 text-slate-600 dark:text-slate-400 text-sm">{children}</blockquote>,
          table: ({children}) => <div className="overflow-x-auto my-3 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm"><table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">{children}</table></div>,
          th: ({children}) => <th className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{children}</th>,
          td: ({children}) => <td className="px-3 py-2 text-xs md:text-sm text-slate-600 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800">{children}</td>,
          code: () => null, // On ignore totalement les blocs de code pour éviter la pollution technique
          pre: () => null,
          p: ({children}) => <p className="text-sm md:text-base mb-2 text-slate-700 dark:text-slate-300 leading-relaxed">{children}</p>,
          strong: ({children}) => {
            const textContent = String(children);
            const canSpeak = onPlayAudio && textContent.length < 50;

            if (!canSpeak) return <strong className="font-bold">{children}</strong>;

            return (
                <span 
                    className="inline-flex items-center gap-1 align-baseline group/word cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 px-1 rounded hover:bg-indigo-100 transition-colors border border-indigo-100 dark:border-indigo-800/50"
                    onClick={(e) => { e.stopPropagation(); onPlayAudio(textContent); }}
                    role="button"
                >
                    <strong className="font-bold text-indigo-700 dark:text-indigo-300">{children}</strong>
                    <Volume2 className="w-3 h-3 text-indigo-500 opacity-50 group-hover/word:opacity-100" />
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

export default memo(MarkdownRenderer);