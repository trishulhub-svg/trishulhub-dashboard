import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { wrapProtocolWithSecurity } from "@/lib/protocol-security";

// ── Public protocol view page ──
// No auth required. Accessible via share link.
// GLM reads this as a normal web document.
// Server-rendered HTML — GLM sees the content directly.
// NO dashboard layout, NO sidebar, NO navigation.
// This page intentionally bypasses the dashboard layout.

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ProtocolViewPage({ params }: PageProps) {
  const { code } = await params;
  const normalizedCode = code.trim().toUpperCase();

  await ensureProtocolTables();

  // Look up the invite by code
  const invite = await db.protocolInvite.findUnique({
    where: { inviteCode: normalizedCode },
    include: { protocol: true },
  });

  // Not found
  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <p className="text-5xl font-bold text-gray-300 mb-4">404</p>
          <p className="text-sm text-gray-400">This link does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  // Revoked
  if (invite.status === "REVOKED") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <p className="text-5xl font-bold text-gray-300 mb-4">Revoked</p>
          <p className="text-sm text-gray-400">This protocol link has been revoked by the administrator.</p>
        </div>
      </div>
    );
  }

  // Expired
  if (new Date() > invite.expiresAt) {
    try {
      await db.protocolInvite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
    } catch { /* non-blocking */ }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <p className="text-5xl font-bold text-gray-300 mb-4">Expired</p>
          <p className="text-sm text-gray-400">This link has expired. Contact your administrator for a new one.</p>
        </div>
      </div>
    );
  }

  // No protocol content
  const protocol = invite.protocol;
  if (!protocol || !protocol.content) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md text-center p-8">
          <p className="text-lg font-bold text-gray-700 mb-2">Protocol Not Available</p>
          <p className="text-sm text-gray-400">The protocol content is not available. Contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Wrap protocol with security rules
  const securedContent = wrapProtocolWithSecurity(protocol.content);

  // Mark as accessed
  if (invite.status === "PENDING") {
    try {
      await db.protocolInvite.update({
        where: { id: invite.id },
        data: { status: "USED", usedAt: new Date() },
      });
    } catch { /* non-blocking */ }
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="border-b-2 border-gray-200 pb-6 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-1">
            {protocol.title || "Trishul Protocol"}
          </h1>
          <p className="text-xs text-gray-400">
            Version {protocol.version || "5.1"} &middot; Confidential &middot; Team Use Only
          </p>
        </div>

        {/* Protocol content */}
        <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
          {securedContent}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 mt-12 pt-4">
          <p className="text-[10px] text-gray-300 text-center">
            Trishul Protocol &middot; Confidential &middot; Do not redistribute
          </p>
        </div>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Trishul Protocol",
  robots: { index: false, follow: false },
};
