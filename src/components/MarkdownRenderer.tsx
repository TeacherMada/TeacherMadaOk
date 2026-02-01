
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="prose prose-indigo dark:prose-invert max-w-none 
                    prose-p:leading-relaxed prose-p:my-1
                    prose-headings:font-black prose-headings:tracking-tight
                    prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({children}) => <h1 className="text-xl font-black text-indigo-700 dark:text-indigo-400 mb-2 mt-4">{children}</h1>,
          h2: ({children}) => <h2 className="text-lg font-black text-indigo-600 dark:text-indigo-400 mb-2 mt-4">{children}</h2>,
          ul: ({children}) => <ul className="list-disc list-outside ml-4 space-y-1 mb-3">{children}</ul>,
          li: ({children}) => <li className="pl-1 text-sm md:text-base leading-relaxed">{children}</li>,
          p: ({children}) => <p className="text-sm md:text-base mb-2 leading-relaxed">{children}</p>,
          code: () => null, // Interdire le code brut
          pre: () => null
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
