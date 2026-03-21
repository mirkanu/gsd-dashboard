import { X } from "lucide-react";
import type { GsdProject } from "../lib/types";

interface GsdDrawerProps {
  project: GsdProject;
  onClose: () => void;
}

export function GsdDrawer({ project, onClose }: GsdDrawerProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-2 border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-100 capitalize">{project.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-gray-500">File viewer coming in Phase 6.</p>
        </div>
      </div>
    </>
  );
}
