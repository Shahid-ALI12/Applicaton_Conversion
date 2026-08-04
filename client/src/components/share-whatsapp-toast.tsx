/**
 * Shared WhatsApp-share follow-up toast.
 * ─────────────────────────────────────────────────────────────
 * Every bill-download flow (customer khata, mix order, purchase
 * bill, purchase receipt, buy-product) calls shareBillOnWhatsApp()
 * right after the PDF downloads. They all need to show the SAME
 * follow-up toast explaining:
 *   - WhatsApp chat has been opened with the client (text caption
 *     is pre-filled)
 *   - The PDF must be attached MANUALLY by the user from their
 *     Downloads folder (wa.me URLs cannot carry files)
 *   - Step-by-step instructions for the manual attachment
 *
 * Centralising this here means the message stays consistent across
 * all call sites. Callers just do:
 *
 *     const result = shareBillOnWhatsApp(billResult);
 *     showWhatsAppShareToast(result);
 */
import { toast } from "sonner";
import { CLIENT_WHATSAPP_DISPLAY, type ShareBillResult } from "@/lib/share-whatsapp";

export function showWhatsAppShareToast(result: ShareBillResult): void {
  if (result.triggered) {
    // Success — chat opened. Show step-by-step manual-attach
    // instructions. The caption text is already in the chat
    // input box; user just needs to attach the PDF and hit send.
    toast.success("WhatsApp chat client ke saath khul gayi!", {
      description: (
        <span className="text-xs leading-relaxed">
          Chat mein text caption pehle se likha hua hai. Ab PDF
          attach karni hai:
          <br />
          <br />
          <strong>1.</strong> Chat ke input box ke upar{" "}
          <strong>📎 (attachment) icon</strong> par tap karein
          <br />
          <strong>2.</strong> <strong>Document</strong> par tap
          karein
          <br />
          <strong>3.</strong> Apni <strong>Downloads</strong>{" "}
          folder mein se bill PDF select karein
          <br />
          <strong>4.</strong> Wapas chat mein aakar{" "}
          <strong>Send (➤)</strong> dabayein
          <br />
          <br />
          Client number: {CLIENT_WHATSAPP_DISPLAY}
          <br />
          <br />
          Agar chat auto-open nahi hui, to yahan click karein:{" "}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            Open WhatsApp Chat →
          </a>
        </span>
      ),
      duration: 60000,
    });
    return;
  }

  // All automated mechanisms failed — show manual link only.
  toast.error("WhatsApp chat auto-open nahi ho saki", {
    description: (
      <span className="text-xs leading-relaxed">
        Popup blocker ne block kar diya. Neeche link par click
        karein — PDF Downloads folder mein hai, chat mein{" "}
        <strong>📎 → Document</strong> se attach karein.
        <br />
        <br />
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline font-medium"
        >
          Open WhatsApp Chat →
        </a>
      </span>
    ),
    duration: 60000,
  });
}
