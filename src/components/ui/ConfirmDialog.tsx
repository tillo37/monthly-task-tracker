import type { ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmOptions | null;
  onClose: () => void;
}

/** Modal replacement for `window.confirm`, used before any destructive action. */
export function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
  if (!request) return null;

  const { title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger' } =
    request;

  const confirm = () => {
    request.onConfirm();
    onClose();
  };

  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-md btn-subtle" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-md ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
