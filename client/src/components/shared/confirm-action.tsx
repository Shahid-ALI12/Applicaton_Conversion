
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Database } from "lucide-react";

interface ConfirmActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  loading?: boolean;
}

export default function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmActionProps) {
  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : variant === "warning"
        ? "bg-amber-600 hover:bg-amber-700 text-white"
        : "bg-blue-600 hover:bg-blue-700 text-white";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className={`h-5 w-5 shrink-0 ${
                variant === "danger"
                  ? "text-red-500"
                  : variant === "warning"
                    ? "text-amber-500"
                    : "text-blue-500"
              }`}
            />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 leading-relaxed">
            {description}
          </AlertDialogDescription>

          <div className="flex items-start gap-3 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Database className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700">
              <p className="font-semibold">Database Change</p>
              <p className="mt-0.5">
                Ye operation database me permanent changes karega. Aap isko wapas
                nahi kar sakte.
              </p>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={loading}
            className={confirmClass}
          >
            {loading ? "Processing..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}