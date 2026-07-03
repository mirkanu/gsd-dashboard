import { useState, useEffect } from "react";
import { Cpu, Loader2, CheckCircle, XCircle, AlertTriangle, Plus, Trash2, Edit2, X } from "lucide-react";
import { api } from "../lib/api";
import type { OpenRouterModel } from "../lib/types";

const PROVIDERS = [
  { id: "claude", name: "Claude (anthropic.com)", hint: "Full power: multi-file refactors, debugging, GSD phases, agentic sessions" },
  { id: "openrouter", name: "OpenRouter (openrouter.ai)", hint: "Free models via OpenRouter — requires OPENROUTER_API_KEY in .env.production" },
  { id: "minimax", name: "MiniMax (api.minimax.chat)", hint: "Chinese LLM provider — requires MINIMAX_API_KEY in .env.production" },
  { id: "zai", name: "z.AI (api.z.ai)", hint: "Claude via z.AI proxy" },
  { id: "ollama", name: "Local Ollama — qwen2.5-coder:14b", hint: "Light tasks: single-file edits, simple additions, config changes" },
];

const DEFAULT_OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: "openrouter/owl-alpha", name: "Owl Alpha", hint: "OpenRouter's agentic model — tool use, 1M context, free", unknownProvenance: true },
  { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B", hint: "Alibaba, Apache 2.0 — 35B active, 1M context, strongest free coding model" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "NVIDIA Nemotron 3 Ultra", hint: "550B MoE, 55B active, 1M context, frontier reasoning, free" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA Nemotron 3 Super", hint: "120B MoE, 12B active, 1M context, tool use, free" },
  { id: "openai/gpt-oss-120b:free", name: "OpenAI gpt-oss-120b", hint: "117B MoE, 5.1B active, agentic reasoning, tool use — ⚠️ 131K context only" },
  { id: "poolside/laguna-m.1:free", name: "Poolside Laguna M.1", hint: "Purpose-built coding agent, tool calling, reasoning — ⚠️ 262K context only" },
  { id: "cohere/north-mini-code:free", name: "Cohere North Mini Code", hint: "3B active, agentic coding MoE, Apache 2.0 — ⚠️ 256K context only" },
];

const DEFAULT_OPENROUTER_MODEL = "openrouter/owl-alpha";

type TestState = {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
  latency?: number;
  model?: string;
};

interface EditingModel {
  id: string;
  name: string;
  hint: string;
  unknownProvenance: boolean;
}

export function LLMProviderPage() {
  const [selectedProvider, setSelectedProvider] = useState<string>("claude");
  const [openrouterModel, setOpenrouterModel] = useState<string | null>(null);
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>(DEFAULT_OPENROUTER_MODELS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  // Model editing state
  const [isEditingModels, setIsEditingModels] = useState(false);
  const [editingModel, setEditingModel] = useState<EditingModel | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isSavingModels, setIsSavingModels] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Load current provider
    api.settings
      .getLLMProvider()
      .then((data) => {
        if (!cancelled && data.provider) {
          setSelectedProvider(data.provider);
          if (data.provider === "openrouter" && data.model) {
            setOpenrouterModel(data.model);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load provider:", err);
        if (!cancelled) setError("Failed to load current provider");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // Load saved OpenRouter models
    api.appSettings
      .getOpenRouterModels()
      .then((savedModels) => {
        if (!cancelled && savedModels) {
          setOpenrouterModels(savedModels);
        }
      })
      .catch((err) => {
        console.error("Failed to load OpenRouter models:", err);
        // Keep using defaults
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderChange = async (providerId: string, modelOverride?: string) => {
    if (providerId === selectedProvider && !modelOverride) return;

    // For OpenRouter, require explicit model selection
    if (providerId === "openrouter" && !modelOverride && !openrouterModel) {
      setSelectedProvider(providerId);
      return; // Let user select a model first
    }

    const model = providerId === "openrouter" ? (modelOverride ?? openrouterModel!) : undefined;

    // For non-default providers, test connectivity first
    if (providerId !== "claude") {
      setTestState({ status: "testing" });
      setError(null);
      try {
        const result = await api.settings.testLLMProvider(providerId, model);
        if (!result.ok) {
          setTestState({ status: "error", message: result.error });
          return;
        }
        setTestState({
          status: "success",
          message: result.detail,
          latency: result.latency_ms,
          model: result.model,
        });
      } catch {
        setTestState({ status: "error", message: "Connection test failed" });
        return;
      }
    } else {
      setTestState({ status: "idle" });
    }

    // Test passed (or skipped for claude) — apply the switch
    setIsSaving(true);
    setError(null);
    try {
      await api.settings.setLLMProvider(providerId, model);
      setSelectedProvider(providerId);
    } catch (err) {
      console.error("Failed to update provider:", err);
      setError("Failed to update provider");
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelChange = async (modelId: string) => {
    setOpenrouterModel(modelId);
    if (selectedProvider === "openrouter") {
      await handleProviderChange("openrouter", modelId);
    }
  };

  const handleSaveModels = async () => {
    setIsSavingModels(true);
    setModelsError(null);
    try {
      await api.appSettings.setOpenRouterModels(openrouterModels);
      setIsEditingModels(false);
    } catch (err) {
      console.error("Failed to save models:", err);
      setModelsError("Failed to save models");
    } finally {
      setIsSavingModels(false);
    }
  };

  const handleResetModels = () => {
    setOpenrouterModels(DEFAULT_OPENROUTER_MODELS);
  };

  const handleAddModel = () => {
    setEditingModel({
      id: "",
      name: "",
      hint: "",
      unknownProvenance: false,
    });
    setIsAddingModel(true);
  };

  const handleEditModel = (model: OpenRouterModel) => {
    setEditingModel({
      id: model.id,
      name: model.name,
      hint: model.hint,
      unknownProvenance: model.unknownProvenance || false,
    });
    setIsAddingModel(false);
  };

  const handleSaveModel = () => {
    if (!editingModel || !editingModel.id.trim() || !editingModel.name.trim()) {
      setModelsError("ID and name are required");
      return;
    }

    const newModel: OpenRouterModel = {
      id: editingModel.id.trim(),
      name: editingModel.name.trim(),
      hint: editingModel.hint.trim(),
      unknownProvenance: editingModel.unknownProvenance,
    };

    if (isAddingModel) {
      setOpenrouterModels([...openrouterModels, newModel]);
    } else {
      setOpenrouterModels(
        openrouterModels.map((m) => (m.id === editingModel.id ? newModel : m))
      );
    }

    setEditingModel(null);
    setIsAddingModel(false);
    setModelsError(null);
  };

  const handleDeleteModel = (modelId: string) => {
    setOpenrouterModels(openrouterModels.filter((m) => m.id !== modelId));
    if (openrouterModel === modelId) {
      setOpenrouterModel(null);
    }
  };

  const selectedModelName = openrouterModels.find((m) => m.id === openrouterModel)?.name || "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">LLM Provider</h1>
            <p className="text-sm text-gray-500">Select your Claude API provider</p>
          </div>
        </div>

        {/* Edit models button */}
        {selectedProvider === "openrouter" && !isLoading && (
          <button
            onClick={() => setIsEditingModels(!isEditingModels)}
            className="px-3 py-1.5 text-xs font-medium bg-surface-1 border border-border rounded-md hover:border-accent transition-colors flex items-center gap-1.5 text-gray-300"
          >
            {isEditingModels ? <X className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
            {isEditingModels ? "Done" : "Edit Models"}
          </button>
        )}
      </div>

      {/* Provider Selector Card */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Provider
        </label>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading current provider...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((provider) => (
              <label
                key={provider.id}
                className={`flex items-center gap-3 p-3 bg-surface-1 border rounded-md cursor-pointer transition-all ${
                  selectedProvider === provider.id
                    ? "border-accent bg-accent/20"
                    : "border-border hover:border-accent/50"
                } ${isSaving || testState.status === "testing" ? "opacity-50 pointer-events-none" : ""}`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={selectedProvider === provider.id}
                  onChange={() => handleProviderChange(provider.id)}
                  className="sr-only"
                  disabled={isSaving || testState.status === "testing"}
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
                <div className="flex flex-col">
                  <span
                    className={`text-sm ${
                      selectedProvider === provider.id
                        ? "text-white"
                        : "text-gray-300"
                    }`}
                  >
                    {provider.name}
                  </span>
                  {provider.hint && (
                    <span className="text-xs text-gray-500 mt-0.5">{provider.hint}</span>
                  )}
                </div>
                {isSaving && selectedProvider === provider.id && (
                  <Loader2 className="w-3 h-3 animate-spin text-accent ml-auto" />
                )}
              </label>
            ))}
          </div>
        )}

        {/* OpenRouter model selector */}
        {selectedProvider === "openrouter" && !isLoading && (
          <div className="mt-3 space-y-1">
            {!openrouterModel && !isEditingModels && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-center gap-2 text-sm text-amber-400 mb-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Please select a model to use OpenRouter</span>
              </div>
            )}

            {/* Edit mode: model list with actions */}
            {isEditingModels ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Models
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetModels}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Reset to defaults
                    </button>
                    <button
                      onClick={handleAddModel}
                      disabled={isSavingModels}
                      className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Model
                    </button>
                  </div>
                </div>

                {openrouterModels.map((model) => (
                  <div
                    key={model.id}
                    className="p-3 bg-surface-1 border border-border rounded-md flex items-center gap-2 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{model.name}</span>
                        {model.unknownProvenance && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                            UNKNOWN PROVENANCE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{model.hint}</div>
                      <div className="text-xs text-gray-600 mt-0.5 font-mono">{model.id}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditModel(model)}
                        className="p-1.5 text-gray-400 hover:text-accent hover:bg-surface-2 rounded transition-colors"
                        disabled={isSavingModels}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-surface-2 rounded transition-colors"
                        disabled={isSavingModels}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Edit/Add Model Dialog */}
                {editingModel && (
                  <div className="p-3 bg-surface-1 border border-accent rounded-md space-y-2">
                    <h4 className="text-sm font-medium text-gray-200">
                      {isAddingModel ? "Add New Model" : "Edit Model"}
                    </h4>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Model ID</label>
                      <input
                        type="text"
                        value={editingModel.id}
                        onChange={(e) => setEditingModel({ ...editingModel, id: e.target.value })}
                        placeholder="e.g., openrouter/my-model"
                        disabled={!isAddingModel}
                        className="w-full px-2 py-1 text-sm bg-surface-2 border border-border rounded focus:border-accent focus:outline-none disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Display Name</label>
                      <input
                        type="text"
                        value={editingModel.name}
                        onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                        placeholder="e.g., My Model"
                        className="w-full px-2 py-1 text-sm bg-surface-2 border border-border rounded focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">Description</label>
                      <input
                        type="text"
                        value={editingModel.hint}
                        onChange={(e) => setEditingModel({ ...editingModel, hint: e.target.value })}
                        placeholder="Brief description of the model"
                        className="w-full px-2 py-1 text-sm bg-surface-2 border border-border rounded focus:border-accent focus:outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={editingModel.unknownProvenance}
                        onChange={(e) => setEditingModel({ ...editingModel, unknownProvenance: e.target.checked })}
                        className="rounded"
                      />
                      Mark as unknown provenance
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleSaveModel}
                        className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingModel(null);
                          setIsAddingModel(false);
                          setModelsError(null);
                        }}
                        className="px-3 py-1 text-xs bg-surface-2 border border-border rounded hover:border-accent transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  {modelsError && (
                    <span className="text-xs text-red-400">{modelsError}</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingModels(false)}
                      disabled={isSavingModels}
                      className="px-3 py-1 text-xs bg-surface-2 border border-border rounded hover:border-accent transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveModels}
                      disabled={isSavingModels}
                      className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isSavingModels ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* View mode: radio buttons for model selection */
              <>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Model
                </label>
                {openrouterModels.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm text-amber-400">
                    No models configured. Click "Edit Models" to add some.
                  </div>
                ) : (
                  openrouterModels.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 p-3 bg-surface-1 border rounded-md cursor-pointer transition-all ${
                        openrouterModel === m.id
                          ? "border-accent bg-accent/20"
                          : "border-border hover:border-accent/50"
                      } ${isSaving || testState.status === "testing" ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <input
                        type="radio"
                        name="openrouter-model"
                        value={m.id}
                        checked={openrouterModel === m.id}
                        onChange={() => handleModelChange(m.id)}
                        className="sr-only"
                        disabled={isSaving || testState.status === "testing"}
                      />
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                          openrouterModel === m.id ? "border-accent bg-accent" : "border-border"
                        }`}
                      >
                        {openrouterModel === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm ${openrouterModel === m.id ? "text-white" : "text-gray-300"}`}>
                          {m.name}
                          {"unknownProvenance" in m && m.unknownProvenance && (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                              UNKNOWN PROVENANCE
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-500 mt-0.5">{m.hint}</span>
                      </div>
                    </label>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* Test Status */}
        {testState.status === "testing" && (
          <div className="mt-3 p-3 bg-surface-1 border border-border rounded-md flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Testing connection (model may need to load, up to 2 min)...</span>
          </div>
        )}

        {testState.status === "success" && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Connected — {testState.model}
              {testState.latency ? ` (${(testState.latency / 1000).toFixed(1)}s)` : ""}
            </span>
          </div>
        )}

        {testState.status === "error" && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-md flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span>{testState.message}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Status Indicator */}
        <div className="mt-4 p-3 bg-surface-1 border border-border rounded-md flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-300">
            Active: {PROVIDERS.find((p) => p.id === selectedProvider)?.name}
            {selectedProvider === "openrouter" && selectedModelName && ` — ${selectedModelName}`}
          </span>
        </div>

        {/* Restart notice */}
        {selectedProvider === "claude" ? (
          <p className="text-xs text-amber-400 mt-2 font-medium">
            ⚠️ Restart your Claude CLI session (/exit then restart) to use Anthropic
          </p>
        ) : (
          <p className="text-xs text-gray-500 mt-2">
            ✓ This provider takes effect immediately for all sessions
          </p>
        )}
      </div>
    </div>
  );
}
