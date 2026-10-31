'use client';

import React from 'react';
import {
  AuditLogEntry,
  formatCurrency,
  formatSignedDelta,
} from '@/lib/formatters';
import { History, Trash2 } from 'lucide-react';

interface AuditTrailSidebarProps {
  logs: AuditLogEntry[];
  currencySymbol: string;
  onClearLogs: () => void;
}

export default function AuditTrailSidebar({
  logs,
  currencySymbol,
  onClearLogs,
}: AuditTrailSidebarProps) {
  return (
    <aside
      aria-label="Audit Trail and Governance Log"
      className="w-full xl:w-80 shrink-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Audit Trail & Governance Log ({logs.length})
          </h2>
        </div>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={onClearLogs}
            title="Clear Audit Log"
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="p-3 flex-1 overflow-y-auto max-h-[720px] space-y-2.5">
        {logs.length === 0 ? (
          <div className="py-8 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
            No manual parameter changes recorded yet. Click any Link Ratio cell to exclude an outlier, adjust an LDF/Tail Factor, or run Auto-Optimize Reserve to log governance impact.
          </div>
        ) : (
          logs.map((entry) => {
            const delta = formatSignedDelta(entry.deltaIbnr, currencySymbol);
            return (
              <div
                key={entry.id}
                className="p-3 rounded border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{entry.timestamp}</span>
                  <span>·</span>
                  <span
                    className={`font-semibold ${
                      delta.tone === 'positive'
                        ? 'text-amber-600 dark:text-amber-400'
                        : delta.tone === 'negative'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    ΔIBNR: {delta.text}
                  </span>
                </div>

                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {entry.title}
                </div>

                <div className="text-slate-600 dark:text-slate-400 leading-snug">
                  {entry.detail}
                </div>

                <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>
                    Before: {formatCurrency(Math.round(entry.previousIbnr), currencySymbol)}
                  </span>
                  <span>→</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    After: {formatCurrency(Math.round(entry.newIbnr), currencySymbol)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
