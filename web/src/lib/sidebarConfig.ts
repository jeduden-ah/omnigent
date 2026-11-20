import { createContext } from "react";
import { appConfig } from "@/appConfig";
import type { Conversation } from "@/hooks/useConversations";
import { pinProjectKey, type PinScope } from "@/lib/sessionListCache";

export type { SidebarConfig } from "@/appConfig";

export const sidebarConfig = appConfig.sidebar;
export const SidebarConfigContext = createContext(sidebarConfig);
/**
 * Whether pinning `row` in `scope` would go over that scope's pin limit: the
 * global Pinned section and each project have separate limits.
 */
export type PinCapacityCheck = (
  row: Pick<Conversation, "labels" | "project_id">,
  scope: PinScope,
) => boolean;
export const PinCapacityContext = createContext<PinCapacityCheck>(() => false);

/** The scope a plain "Pin" uses: the session's project when it has one, else global. */
export function defaultPinScope(row: Pick<Conversation, "labels" | "project_id">): PinScope {
  return pinProjectKey(row) ? "project" : "global";
}
