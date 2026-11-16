import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface NistPasswordMeterProps {
  password: string;
  email?: string;
  name?: string;
}

const SEQUENCES = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnm',
];

const BLOCKLIST = new Set([
  'password', 'password123', '12345678', '123456789', 'qwertyuiop',
  'admin123', 'welcome123', 'letmein123', 'changeme', 'verdant123',
]);

export const NistPasswordMeter: React.FC<NistPasswordMeterProps> = ({ password, email, name }) => {
  const analysis = useMemo(() => {
    const normalized = (password || '').normalize('NFKC');
    const lower = normalized.toLowerCase();
    const len = normalized.length;

    const minLengthMet = len >= 8;
    const recommendedLengthMet = len >= 15;
    const hasRepetitive = /(.)\1{3,}/.test(normalized);
    let hasSequential = false;
    for (const seq of SEQUENCES) {
      for (let i = 0; i <= seq.length - 5; i++) {
        if (lower.includes(seq.substring(i, i + 5))) {
          hasSequential = true;
          break;
        }
      }
      if (hasSequential) break;
    }

    const terms = [
      'verdant', 'botanical',
      email ? email.split('@')[0]?.toLowerCase() : '',
      name ? name.toLowerCase() : '',
    ].filter((t) => t && t.length >= 3);
    const hasContextTerm = terms.some((t) => lower.includes(t));
    const isBlocklisted = BLOCKLIST.has(lower);

    let entropy = 0;
    const words = normalized.trim().split(/[\s\-_]+/);
    if (words.length >= 3 && words.every((w) => w.length >= 2)) {
      entropy = Math.round(words.length * 12.9);
    } else {
      let pool = 0;
      if (/[a-z]/.test(normalized)) pool += 26;
      if (/[A-Z]/.test(normalized)) pool += 26;
      if (/[0-9]/.test(normalized)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(normalized)) pool += 33;
      if (pool > 0) entropy = Math.round(len * (Math.log(pool) / Math.log(2)));
    }

    const compliant =
      minLengthMet &&
      !hasRepetitive &&
      !hasSequential &&
      !isBlocklisted &&
      (!hasContextTerm || recommendedLengthMet);

    let strengthLabel = 'Weak';
    let barColor = 'bg-rose-500';
    let barWidth = 'w-1/4';
    if (compliant && recommendedLengthMet && entropy >= 64) {
      strengthLabel = 'NIST High-Entropy';
      barColor = 'bg-emerald-500';
      barWidth = 'w-full';
    } else if (compliant && entropy >= 45) {
      strengthLabel = 'NIST Compliant';
      barColor = 'bg-verdant';
      barWidth = 'w-3/4';
    } else if (minLengthMet) {
      strengthLabel = 'Fair';
      barColor = 'bg-amber-500';
      barWidth = 'w-1/2';
    }

    return {
      len,
      minLengthMet,
      recommendedLengthMet,
      hasRepetitive,
      hasSequential,
      hasContextTerm,
      isBlocklisted,
      entropy,
      compliant,
      strengthLabel,
      barColor,
      barWidth,
    };
  }, [password, email, name]);

  if (!password) return null;

  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-left">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-verdant" />
          NIST SP 800-63B • {analysis.entropy} bits
        </span>
        <span className={analysis.compliant ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
          {analysis.strengthLabel}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-300 ${analysis.barColor} ${analysis.barWidth}`} />
      </div>
      <div className="grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          {analysis.minLengthMet ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
          )}
          <span>At least 8 characters (15+ passphrase recommended)</span>
        </div>
        {(analysis.hasRepetitive || analysis.hasSequential || analysis.isBlocklisted) && (
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Avoid repeated characters, sequences (12345/qwerty), or common passwords</span>
          </div>
        )}
        {analysis.hasContextTerm && !analysis.recommendedLengthMet && (
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Avoid using your name, email, or "verdant" in short passwords</span>
          </div>
        )}
      </div>
    </div>
  );
};
