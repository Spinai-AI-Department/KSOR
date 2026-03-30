import { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, X, Info } from "lucide-react";

// ── Center Toast ─────────────────────────────────────────────
// A message overlay that appears in the CENTER of the screen.
// Used for success, error, warning, and info feedback.

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastData {
  type: ToastType;
  title?: string;
  message: string;
  /** Field-level errors to highlight; key = field name, value = reason */
  fieldErrors?: Record<string, string>;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-6 h-6 text-green-500" />,
  error: <AlertCircle className="w-6 h-6 text-red-500" />,
  warning: <AlertTriangle className="w-6 h-6 text-yellow-500" />,
  info: <Info className="w-6 h-6 text-blue-500" />,
};

const BORDER_COLOR: Record<ToastType, string> = {
  success: "border-green-200",
  error: "border-red-200",
  warning: "border-yellow-200",
  info: "border-blue-200",
};

const BG_COLOR: Record<ToastType, string> = {
  success: "bg-green-50",
  error: "bg-red-50",
  warning: "bg-yellow-50",
  info: "bg-blue-50",
};

const DEFAULT_TITLE: Record<ToastType, string> = {
  success: "완료",
  error: "오류",
  warning: "경고",
  info: "안내",
};

export function CenterToast({
  toast,
  onClose,
  duration = 4000,
}: {
  toast: ToastData | null;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    // Don't auto-close error toasts with field errors — user needs to read them
    if (toast.type === "error" && toast.fieldErrors && Object.keys(toast.fieldErrors).length > 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const title = toast.title ?? DEFAULT_TITLE[toast.type];
  const hasFieldErrors = toast.fieldErrors && Object.keys(toast.fieldErrors).length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto max-w-md w-full mx-4 rounded-2xl border ${BORDER_COLOR[toast.type]} ${BG_COLOR[toast.type]} shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200`}
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex-shrink-0 mt-0.5">{ICONS[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-sm text-gray-600 mt-1">{toast.message}</p>

            {/* Field-level error list */}
            {hasFieldErrors && (
              <ul className="mt-3 space-y-1.5">
                {Object.entries(toast.fieldErrors!).map(([field, reason]) => (
                  <li key={field} className="flex items-start gap-2 text-sm">
                    <span className="inline-block mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span>
                      <span className="font-medium text-red-700">{field}</span>
                      <span className="text-gray-600"> — {reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Center Confirm Dialog ────────────────────────────────────
// Replaces browser's native confirm() with a custom centered dialog.

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const btnClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-gray-900 hover:bg-gray-800 text-white";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3 mb-4">
          {variant === "danger" ? (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          ) : (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Info className="w-5 h-5 text-blue-600" />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${btnClass}`}
          >
            {loading ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
