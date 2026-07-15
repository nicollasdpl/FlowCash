"use client";
import { usePathname } from "next/navigation";
import { CopilotFab, hasOwnFabStack } from "./CopilotFab";

export default function AIAssistant() {
  const pathname = usePathname();

  if (pathname === "/assistente" || hasOwnFabStack(pathname)) return null;

  return (
    <div className="copilot-fab-standalone">
      <CopilotFab />
    </div>
  );
}
