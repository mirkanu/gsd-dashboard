import { useState, useEffect } from "react";
import { Cpu } from "lucide-react";

const PROVIDERS = [
  { id: "claude", name: "Claude (anthropic.com)" },
  { id: "zai", name: "z.AI (api.z.ai)" },
  { id: "ollama", name: "Local Ollama (home PC)" },
];

export function LLMProviderPage() {
  const [selectedProvider, setSelectedProvider] = useState<string>("claude");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("llm_provider");
    if (saved && PROVIDERS.find((p) => p.id === saved)) {
      setSelectedProvider(saved);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("llm_provider", selectedProvider);
    }
  }, [selectedProvider, isLoaded]);

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-100">LLM Provider</h1>
          <p className="text-sm text-gray-500">
            Select your Claude API provider
          </p>
        </div>
      </div>

      {/* Provider Selector Card */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Provider
        </label>

        <div className="space-y-2">
          {PROVIDERS.map((provider) => (
            <label
              key={provider.id}
              className={`flex items-center gap-3 p-3 bg-surface-1 border rounded-md cursor-pointer transition-all ${
                selectedProvider === provider.id
                  ? "border-accent bg-accent/20"
                  : "border-border hover:border-accent/50"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={provider.id}
                checked={selectedProvider === provider.id}
                onChange={() => handleProviderChange(provider.id)}
                className="sr-only"
              />
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedProvider === provider.id
                    ? "border-accent bg-accent"
                    : "border-border"
                }`}
              >
                {selectedProvider === provider.id && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span
                className={`text-sm ${
                  selectedProvider === provider.id
                    ? "text-white"
                    : "text-gray-300"
                }`}
              >
                {provider.name}
              </span>
            </label>
          ))}
        </div>

        {/* Status Indicator */}
        <div className="mt-4 p-3 bg-surface-1 border border-border rounded-md flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-300">
            Active: {PROVIDERS.find((p) => p.id === selectedProvider)?.name}
          </span>
        </div>
      </div>
    </div>
  );
}
