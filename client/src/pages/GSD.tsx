import { MapPin } from "lucide-react";

export function GSD() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">GSD Projects</h2>
          <p className="text-sm text-gray-500">Unified view of all project progress</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <MapPin className="w-6 h-6 text-accent" />
        </div>
        <h3 className="text-lg font-medium text-gray-200 mb-2">Coming in Phase 2</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Project data pipeline is being built. Once complete, you'll see phase progress,
          roadmap status, and requirements coverage for all configured projects.
        </p>
      </div>
    </div>
  );
}
