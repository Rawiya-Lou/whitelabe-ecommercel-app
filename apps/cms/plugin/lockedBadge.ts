import type { DocumentBadgeComponent } from "sanity";
import {LockIcon} from "@sanity/icons/Lock"
import {UnlockIcon} from "@sanity/icons/Unlock"

export const LockedBadge: DocumentBadgeComponent = (props) => {
  // Check both published and draft states
  const isLocked = Boolean(props.draft?.isLocked ?? props.published?.isLocked);

  if (isLocked) {
    return {
      label: `Locked ${LockIcon}`,
      icon: LockIcon,
      title: "This document is protected. Toggle 'Edit Protection' to unlock.",
      color: "danger",
    };
  }

  return {
    label: `Unlocked ${UnlockIcon}`,
    icon: UnlockIcon,
    title: "Document is open for editing.",
    color: "success",
  };
};