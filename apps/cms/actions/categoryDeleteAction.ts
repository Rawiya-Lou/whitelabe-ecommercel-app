import { DocumentActionComponent, useClient } from "sanity";
import { useState, useEffect } from "react";

export function createCategoryDeleteAction(
  originalDeleteAction: DocumentActionComponent,
): DocumentActionComponent {
  return function CategoryDeleteAction(props) {
    const { id, type } = props;

    // Only apply this guard to category documents
    if (type !== "category") {
      return originalDeleteAction(props);
    }

    const client = useClient({ apiVersion: "2026-01-01" });
    const [assignedProductCount, setAssignedProductCount] = useState<number | null>(null);

    useEffect(() => {
      const cleanId = id.replace(/^drafts\./, "");
      const draftId = `drafts.${cleanId}`;

      // GROQ Query: Count all products that reference this category
      client
        .fetch<number>(
          `count(*[_type == "product" && (references($cleanId) || references($draftId))])`,
          { cleanId, draftId },
        )
        .then((count) => {
          setAssignedProductCount(count);
        })
        .catch(() => {
          setAssignedProductCount(0);
        });
    }, [id, client]);

    const originalResult = originalDeleteAction(props);
    if (!originalResult) return null;

    // If products are assigned to this category, disable the Delete button in Sanity Studio
    if (assignedProductCount && assignedProductCount > 0) {
      return {
        ...originalResult,
        disabled: true,
        title: `Cannot delete: This category is assigned to ${assignedProductCount} product(s). Remove the category from those products first.`,
      };
    }

    return originalResult;
  };
}