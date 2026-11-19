import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Button } from './ui/Button';

export interface InstructionItem {
  stepNumber: string | number;
  title?: string;
  content: string;
}

export interface ParsedInstructions {
  intro: string;
  items: InstructionItem[];
}

export function parseInstructions(raw?: string): ParsedInstructions {
  if (!raw || typeof raw !== 'string') return { intro: '', items: [] };
  const text = raw.trim();
  if (!text) return { intro: '', items: [] };

  // Match step/method numbering patterns:
  // "Step 1:", "Method 2.", "1.", "1)", "1、", "Paso 1:", "Étape 1:", "Schritt 1:"
  const stepRegex = /(?:^|\s)(?:(?:(?:Step|Method|Paso|Étape|Etape|Schritt)\s*(\d+)[:.]?\s*)|(?:(\d+)[.、\):：]\s*))/gi;

  const matches: Array<{ index: number; length: number; stepNum: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = stepRegex.exec(text)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      stepNum: m[1] || m[2] || String(matches.length + 1)
    });
  }

  // If no numbered steps found, check for bulleted lines
  if (matches.length <= 1 && !text.match(/^1[.、\):：]/)) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.some(l => /^[-*•]\s+/.test(l))) {
      const items: InstructionItem[] = [];
      let intro = '';
      for (const line of lines) {
        if (/^[-*•]\s+/.test(line)) {
          const content = line.replace(/^[-*•]\s+/, '').trim();
          items.push(parseItemContent(content, items.length + 1));
        } else if (items.length === 0) {
          intro += (intro ? ' ' : '') + line;
        } else {
          items[items.length - 1].content += ' ' + line;
        }
      }
      return { intro, items };
    }

    if (lines.length > 1) {
      return {
        intro: '',
        items: lines.map((l, i) => parseItemContent(l, i + 1))
      };
    }

    return { intro: text, items: [] };
  }

  const firstMatch = matches[0];
  const intro = text.substring(0, firstMatch.index).trim();
  const items: InstructionItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const startIndex = cur.index + cur.length;
    const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    const rawContent = text.substring(startIndex, endIndex).trim();
    if (rawContent) {
      items.push(parseItemContent(rawContent, cur.stepNum || (i + 1)));
    }
  }

  return { intro, items };
}

function parseItemContent(text: string, stepNum: string | number): InstructionItem {
  // Check if item starts with a title like "Division: ..." or "Leaf cuttings: ..."
  const separatorMatch = text.match(/^([^:：—–-]{2,45}?)[:：—–-]\s*(.+)$/s);
  if (separatorMatch) {
    const titleCandidate = separatorMatch[1].trim();
    if (titleCandidate.split(/\s+/).length <= 5) {
      return {
        stepNumber: stepNum,
        title: titleCandidate,
        content: separatorMatch[2].trim()
      };
    }
  }

  return {
    stepNumber: stepNum,
    content: text
  };
}

interface InstructionStepsCardProps {
  title: string;
  icon: React.ReactNode;
  instructionsText?: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyMessage: string;
  onAddClick: () => void;
  addBtnText?: string;
}

export const InstructionStepsCard: React.FC<InstructionStepsCardProps> = ({
  title,
  icon,
  instructionsText,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  onAddClick,
  addBtnText = 'Add Instructions'
}) => {
  const parsed = useMemo(() => parseInstructions(instructionsText), [instructionsText]);

  if (!instructionsText || !instructionsText.trim()) {
    return (
      <section className="bg-md-surface-container-low/50 rounded-[28px] p-8 border border-dashed border-md-outline-variant/50 space-y-4 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 bg-md-surface-container-highest text-md-on-surface-variant rounded-2xl flex items-center justify-center">
          {emptyIcon}
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-md-on-surface-variant">
            {emptyTitle}
          </h3>
          <p className="text-xs text-md-on-surface-variant/80">
            {emptyMessage}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] font-semibold uppercase tracking-wider text-md-primary"
          onClick={onAddClick}
        >
          + {addBtnText}
        </Button>
      </section>
    );
  }

  const { intro, items } = parsed;

  return (
    <section className="m3-card-elevated rounded-[28px] p-6 md:p-8 border border-md-outline-variant/30 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-md-primary/10 text-md-primary flex items-center justify-center shrink-0 border border-md-primary/15 shadow-xs">
            {icon}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-md-primary">
              {title}
            </h3>
            {items.length > 0 && (
              <span className="text-[11px] text-md-on-surface-variant">
                {items.length} {items.length === 1 ? 'Step' : 'Steps'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Overview / Timing & General Advice Box */}
      {intro && (
        <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-md-surface-container-high/60 border border-md-outline-variant/25 text-xs text-md-on-surface-variant leading-relaxed">
          <div className="w-6 h-6 rounded-lg bg-md-primary/15 text-md-primary flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-3.5 h-3.5" />
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-md-primary block">
              Guideline & Timing
            </span>
            <p className="text-xs text-md-on-surface leading-relaxed">
              {intro}
            </p>
          </div>
        </div>
      )}

      {/* Structured Step / Method Items */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-md-surface-container/60 border border-md-outline-variant/20 hover:border-md-primary/30 transition-all flex items-start gap-3.5 group shadow-xs"
            >
              <div className="w-7 h-7 rounded-xl bg-md-primary/12 text-md-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-md-primary/20 group-hover:bg-md-primary group-hover:text-md-on-primary transition-colors">
                {item.stepNumber || (idx + 1)}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {item.title && (
                  <h4 className="text-xs font-bold text-md-on-surface tracking-tight uppercase">
                    {item.title}
                  </h4>
                )}
                <p className="text-xs text-md-on-surface-variant leading-relaxed">
                  {item.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !intro && (
          <p className="text-sm text-md-on-surface leading-relaxed whitespace-pre-wrap">
            {instructionsText}
          </p>
        )
      )}
    </section>
  );
};
