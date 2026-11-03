import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { IProductModuleService } from "@medusajs/framework/types";
import { Modules, MedusaError } from "@medusajs/framework/utils";

interface ResolveProductTagsInput {
  values: string[];
}

export async function resolveProductTagIds(
  productService: IProductModuleService,
  values: string[],
): Promise<string[]> {
  const uniqueValues = [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (uniqueValues.length === 0) {
    return [];
  }

  const findTags = async () => {
    const tags = await productService.listProductTags(
      { value: uniqueValues },
      { take: uniqueValues.length },
    );
    return new Map(tags.map((tag) => [tag.value, tag.id]));
  };

  let tagIdByValue = await findTags();
  const missingValues = uniqueValues.filter(
    (value) => !tagIdByValue.has(value),
  );

  if (missingValues.length > 0) {
    try {
      const createdTags = await productService.createProductTags(
        missingValues.map((value) => ({ value })),
      );
      for (const tag of createdTags) {
        tagIdByValue.set(tag.value, tag.id);
      }
    } catch (error) {
      tagIdByValue = await findTags();
      if (missingValues.some((value) => !tagIdByValue.has(value))) {
        throw error;
      }
    }
  }

  return uniqueValues.map((value) => {
    const id = tagIdByValue.get(value);
    if (!id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Medusa did not return an ID for synchronized product tag "${value}".`,
      );
    }
    return id;
  });
}

export const resolveProductTagsStep = createStep(
  "resolve-product-tags",
  async (
    { values }: ResolveProductTagsInput,
    { container },
  ): Promise<StepResponse<string[]>> => {
    const productService = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    );
    return new StepResponse(await resolveProductTagIds(productService, values));
  },
);
