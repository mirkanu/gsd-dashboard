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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showFtpModal, setShowFtpModal] = useState(false);
  const [copiedFtp, setCopiedFtp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    console.log("[upload] Starting upload for file:", file.name, "Size:", (file.size / 1024 / 1024).toFixed(2), "MB");

    // Check file size before upload (100MB limit)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_SIZE) {
      console.error("[upload] File too large:", (file.size / 1024 / 1024).toFixed(2), "MB");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setUrl(null);
    setUploadProgress(0);

    const xhr = new XMLHttpRequest();
    // Set timeout to 30 minutes for large files (default is often 2 minutes)
    xhr.timeout = 30 * 60 * 1000;

    const fd = new FormData();
    fd.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const rawPercent = (e.loaded / e.total) * 100;
        // Show decimal precision for small values, round for larger ones
        const displayPercent = rawPercent < 1 ? rawPercent.toFixed(1) : Math.round(rawPercent);
        console.log(`[upload] Progress: ${(e.loaded / 1024 / 1024).toFixed(1)}MB / ${(e.total / 1024 / 1024).toFixed(1)}MB = ${displayPercent}%`);
        setUploadProgress(Number(displayPercent));
      }
    });

    xhr.addEventListener("load", () => {
      console.log("[upload] Load event, status:", xhr.status);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          setStatus("done");
          setUrl(data.url);
        } catch {
          console.error("[upload] Failed to parse response");
          setStatus("error");
        }
      } else {
        console.error("[upload] Non-200 status:", xhr.status);
        setStatus("error");
      }
    });

    xhr.addEventListener("error", () => {
      console.error("[upload] XHR error event");
      setStatus("error");
    });

    xhr.addEventListener("timeout", () => {
      console.error("[upload] XHR timeout after 30 minutes");
      setStatus("error");
    });

    xhr.open("POST", "/api/upload");
    console.log("[upload] Sending request...");
    xhr.send(fd);
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
    setUploadProgress(0);
    setShowFtpModal(false);
    setCopiedFtp(false);
  };

  const handleCopyFtp = () => {
    const ftpCredentials = "FTP Host: 37.27.212.18\nFTP User: gsddash-ftp\nFTP Pass: GSDupload2024!";
    navigator.clipboard.writeText(ftpCredentials).catch(() => {
      const el = document.createElement("textarea");
      el.value = ftpCredentials;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
    setCopiedFtp(true);
    setTimeout(() => setCopiedFtp(false), 2000);
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
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Uploading… {uploadProgress}%</span>
              </div>
              <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-200 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs leading-tight">Paste or drop file</p>
              <p className="text-[11px] text-gray-600 mt-0.5">tap to pick</p>
              <p className="text-[10px] text-gray-500 mt-1">max 100MB</p>
            </>
          )}
        </div>
      )}

      {/* FTP button in idle state */}
      {status === "idle" && (
        <button
          onClick={() => setShowFtpModal(true)}
          className="w-full px-2 py-1.5 rounded-md text-xs font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors duration-150 mt-1.5"
        >
          Upload &gt;100MB via FTP
        </button>
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
          <p className="text-xs text-red-400 text-center px-1">File too large (max 100MB)</p>
          <button
            onClick={() => setShowFtpModal(true)}
            className="w-full px-2 py-1.5 rounded-md text-xs font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors duration-150"
          >
            Upload &gt;100MB via FTP
          </button>
          <button
            onClick={handleReset}
            className="w-full text-center text-[11px] text-gray-600 hover:text-gray-400 transition-colors duration-150 py-0.5"
          >
            Try smaller file
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

      {/* FTP Modal */}
      {showFtpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-border rounded-lg shadow-xl max-w-sm w-full p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-200">Upload via FTP</h3>
            <div className="space-y-2 text-xs">
              <p className="text-gray-400">For files larger than 100MB, use FTP:</p>
              <div className="bg-surface-3 border border-border rounded p-2 space-y-1">
                <p className="font-mono text-gray-300"><span className="text-gray-500">Host:</span> 37.27.212.18</p>
                <p className="font-mono text-gray-300"><span className="text-gray-500">User:</span> gsddash-ftp</p>
                <p className="font-mono text-gray-300"><span className="text-gray-500">Pass:</span> GSDupload2024!</p>
              </div>
              <p className="text-gray-500">Upload to: <span className="font-mono">/home/gsddashboard-ftp/uploads</span></p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyFtp}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors duration-150 ${
                  copiedFtp
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25"
                }`}
              >
                {copiedFtp ? "Copied ✓" : "Copy credentials"}
              </button>
              <button
                onClick={() => setShowFtpModal(false)}
                className="flex-1 px-3 py-2 rounded-md text-xs font-medium bg-surface-3 text-gray-400 border border-border hover:text-gray-300 transition-colors duration-150"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
