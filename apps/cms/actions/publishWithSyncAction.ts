import { DocumentActionComponent, DocumentActionProps } from "sanity";

export function createPublishWithSyncAction(
  originalPublishAction: DocumentActionComponent,
): DocumentActionComponent {
  return function PublishWithSyncAction(props: DocumentActionProps) {
    const originalResult = originalPublishAction(props);

    if (!originalResult) return null;

    return {
      ...originalResult,
      label: "Publish & Sync to Medusa",
      onHandle: async () => {
        // 1. Run Sanity's native publish action
        if (originalResult.onHandle) {
          originalResult.onHandle();
        }

        // Optional: Trigger custom studio toast or feedback
        console.log(`[Sanity Studio] Published ${props.type}: ${props.id}. Triggering Medusa sync.`);
      },
    };
  };
}