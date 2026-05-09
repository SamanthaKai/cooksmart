import { useEffect } from "react";

/**
 * Generic in-app confirmation modal.
 *
 * Props:
 *   open        — boolean, controls visibility
 *   title       — string heading
 *   message     — string body text
 *   confirmLabel — label for the destructive button (default "Confirm")
 *   onConfirm   — called when the user clicks the destructive button
 *   onCancel    — called when the user clicks Cancel or the backdrop
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onCancel?.(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="confirm-modal"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="confirm-title" id="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn confirm-btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
