import { useState, useRef, DragEvent, ClipboardEvent } from "react";
import { Upload } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface UploadPanelProps {
  slim?: boolean;
}

export function UploadPanel({ slim = false }: UploadPanelProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus("uploading");
    setUrl(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setStatus("done");
        setUrl(data.url);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const file = e.clipboardData.files[0];
    if (file) handleFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = () => {
    const file = fileInputRef.current?.files?.[0];
    handleFile(file);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback: select + execCommand for older iOS
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setStatus("idle");
    setUrl(null);
    setCopied(false);
  };

  // Slim mode: icon only
  if (slim) return null;

  return (
    <div className="px-2 py-1">
      {/* Section label */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <Upload className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Upload</span>
      </div>

      {/* Drop zone */}
      {(status === "idle" || status === "uploading") && (
        <div
          role="button"
          tabIndex={0}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onPaste={handlePaste}
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
          className={`border border-dashed rounded-lg px-3 py-3 cursor-pointer text-center transition-colors duration-150 select-none ${
            isDragOver
              ? "border-accent/60 bg-accent/10 text-accent"
              : status === "uploading"
              ? "border-border/50 bg-surface-3/40 cursor-not-allowed"
              : "border-border/50 hover:border-border text-gray-500 hover:text-gray-400 hover:bg-surface-3/60"
          }`}
        >
          {status === "uploading" ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Uploading…</span>
            </div>
          ) : (
            <>
              <p className="text-xs leading-tight">Paste or drop file</p>
              <p className="text-[11px] text-gray-600 mt-0.5">tap to pick</p>
            </>
          )}
        </div>
      )}

      {/* Success state */}
      {status === "done" && url && (
        <div className="space-y-1.5">
          <div
            className="bg-surface-3 border border-border rounded-md px-2 py-1.5 overflow-hidden"
            title={url}
          >
            <p className="text-[11px] font-mono text-gray-300 truncate">{url}</p>
          </div>
          <button
            onClick={handleCopy}
            className={`w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 ${
              copied
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25"
            }`}
          >
            {copied ? "Copied ✓" : "Copy URL"}
          </button>
          <button
            onClick={handleReset}
            className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors duration-150 py-0.5"
          >
            Upload another
          </button>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="space-y-1.5">
          <p className="text-xs text-red-400 text-center px-1">Upload failed</p>
          <button
            onClick={handleReset}
            className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors duration-150 py-0.5"
          >
            Try again
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
