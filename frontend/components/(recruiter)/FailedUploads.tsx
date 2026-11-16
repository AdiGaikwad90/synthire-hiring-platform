"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Button, Modal, useToast } from "@/components/ui";
import { useDeleteCandidate } from "@/hooks/queries/useCandidates";
import { apiErrorMessage, type ApiFailedUpload } from "@/lib/api";
import { FAILED_NAME } from "@/lib/candidate-display";
import { formatDateTime } from "@/lib/utils";

/**
 * Resumes whose processing failed, shown apart from the candidates: why each
 * one failed, the file to check, and a way to clear it. They used to sit among
 * the candidates as "Processing..." with a 0% score (SYN-008).
 */
export function FailedUploads({ uploads }: { uploads?: { items: ApiFailedUpload[]; total: number } }) {
  const router = useRouter();
  const toast = useToast();
  const remove = useDeleteCandidate();
  const [confirming, setConfirming] = React.useState<ApiFailedUpload | null>(null);

  if (!uploads || uploads.items.length === 0) return null;
  const hidden = uploads.total - uploads.items.length;

  const confirmRemove = () => {
    if (!confirming) return;
    remove.mutate(confirming.id, {
      onSuccess: () => toast({ message: "Failed upload removed." }),
      onError: (e) => toast({ message: `Could not remove it: ${apiErrorMessage(e, "please try again")}`, variant: "error" }),
      onSettled: () => setConfirming(null),
    });
  };

  return (
    <div className="tsFlagBox" role="region" aria-label="Failed uploads"
      style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", marginBottom: 16 }}>
      <div className="tiny" style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Icon.AlertTriangle size={12}/>
        {uploads.total} failed upload{uploads.total !== 1 ? "s" : ""} — not counted as candidates
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {uploads.items.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {f.name ?? FAILED_NAME}
                <span className="small" style={{ color: "var(--muted)", fontWeight: 400 }}> · uploaded {formatDateTime(f.created_at)}</span>
              </div>
              <div className="small" style={{ color: "var(--text-2)", overflowWrap: "anywhere" }}>{f.reason}</div>
            </div>
            {f.has_file && (
              <Button variant="ghost" size="sm" icon={<Icon.FileText size={12}/>} onClick={() => router.push(`/candidates/${f.id}`)}>
                View file
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={<Icon.Trash size={12}/>} onClick={() => setConfirming(f)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <div className="small" style={{ color: "var(--muted)", marginTop: 8 }}>
          and {hidden} more — remove some to see the rest.
        </div>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => { if (!remove.isPending) setConfirming(null); }}
        width={440}
        title="Remove this failed upload?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={remove.isPending}>Keep it</Button>
            <Button variant="danger" loading={remove.isPending} onClick={confirmRemove}>Remove</Button>
          </>
        }
      >
        <div className="small" style={{ color: "var(--text-2)" }}>
          The stored file is deleted with it. To try again, upload the resume once more.
        </div>
      </Modal>
    </div>
  );
}
