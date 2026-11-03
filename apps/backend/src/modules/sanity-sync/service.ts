import { createHash, randomUUID } from "node:crypto";
import { MedusaError, MedusaService } from "@medusajs/framework/utils";
import { syncLock } from "../../utils/sync-lock";
import {
  MedusaVariantInput,
  SanityVariantDocument,
  SanityVariantOption,
} from "./types";

type SanityModuleOptions = {
  api_token: string;
  project_id: string;
  dataset: string;
  api_version?: string;
};

export default class SanityModuleService extends MedusaService({}) {
  protected options_: SanityModuleOptions;
  private readonly maxRetries = 4;
  private readonly requestTimeoutMs = 15000;

  constructor({}, options: SanityModuleOptions) {
    super(...arguments);
    this.options_ = options;
  }

  get clientConfig() {
    return {
      projectId: this.options_.project_id,
      dataset: this.options_.dataset || "production",
      token: this.options_.api_token,
      apiVersion: this.options_.api_version || "2024-01-01",
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
        });
        const body = await response.text();
        const isRetryable =
          response.status === 429 || response.status >= 500;
        if (!isRetryable || attempt === this.maxRetries) {
          return new Response(body || null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        const retryAfter = Number(response.headers.get("retry-after"));
        const exponentialDelay = Math.min(8000, 250 * 2 ** attempt);
        const backoffMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000 + Math.random() * exponentialDelay
            : exponentialDelay * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } catch (error) {
        if (attempt === this.maxRetries) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            `Sanity request failed after ${attempt + 1} attempts: ${reason}`,
          );
        }
        const backoffMs = Math.min(8000, 250 * 2 ** attempt) *
          (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Sanity request failed after retrying transient errors.",
    );
  }

  async query(groq: string, params: Record<string, any> = {}) {
    const { projectId, dataset, token, apiVersion } = this.clientConfig;
    const searchParams = new URLSearchParams({
      query: groq,
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [`$${k}`, JSON.stringify(v)])
      ),
    });

    const res = await this.fetchWithRetry(
      `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}?${searchParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Sanity query failed (${res.status}): ${JSON.stringify(data)}`,
      );
    }
    return data.result;
  }

  async mutate(mutations: object[]) {
    const { projectId, dataset, token, apiVersion } = this.clientConfig;
    const res = await this.fetchWithRetry(
      `https://${projectId}.api.sanity.io/v${apiVersion}/data/mutate/${encodeURIComponent(dataset)}?returnDocuments=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mutations }),
      }
    );

    const body = await res.json();
    if (!res.ok) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Sanity Mutation Error (${res.status}): ${JSON.stringify(body)}`);
    }
    return body;
  }

  async syncProductVariants(
    sanityDocId: string,
    medusaVariants: MedusaVariantInput[],
  ): Promise<{
    changed: boolean;
    reason: "updated" | "unchanged" | "locked";
    variantCount: number;
  }> {
    const lockKey = `medusa-sync:${sanityDocId}`;
    const leaseToken = await syncLock.acquire(lockKey, 20);
    if (!leaseToken) {
      return { changed: false, reason: "locked", variantCount: 0 };
    }

    try {
      const current = await this.query(
        '*[_id == $id][0]{ _id, variants }',
        { id: sanityDocId },
      );
      if (!current || typeof current !== "object") {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `Sanity product "${sanityDocId}" was not found for variant synchronization.`,
        );
      }

      const currentDocument = current as {
        variants?: unknown;
      };
      const existingVariants = Array.isArray(currentDocument.variants)
        ? currentDocument.variants.filter(
            (variant): variant is SanityVariantDocument =>
              typeof variant === "object" &&
              variant !== null &&
              !Array.isArray(variant),
          )
        : [];
      const existingByMedusaId = new Map<string, SanityVariantDocument>();
      const currentMedusaIds = new Set(
        medusaVariants
          .map((variant) => variant.id)
          .filter((id): id is string => typeof id === "string" && !!id),
      );

      for (const variant of existingVariants) {
        for (const variantId of [
          variant.medusa_variant_id,
          variant.variantId,
          variant.sanity_variant_id,
          variant._key,
        ]) {
          if (typeof variantId === "string" && variantId) {
            existingByMedusaId.set(variantId, variant);
          }
        }
      }

      const makeArrayKey = (prefix: string, value: string): string =>
        `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;

      const optionIdentity = (
        options: unknown,
      ): string | undefined => {
        const values: Array<[string, string]> = [];
        if (Array.isArray(options)) {
          for (const option of options) {
            if (
              typeof option !== "object" ||
              option === null ||
              Array.isArray(option)
            ) {
              continue;
            }
            const record = option as Record<string, unknown>;
            const optionName =
              typeof record.option === "string"
                ? record.option
                : typeof record.option === "object" &&
                    record.option !== null &&
                    "title" in record.option
                  ? (record.option as { title?: unknown }).title
                  : undefined;
            if (
              typeof optionName === "string" &&
              typeof record.value === "string"
            ) {
              values.push([optionName.trim(), record.value.trim()]);
            }
          }
        } else if (
          typeof options === "object" &&
          options !== null
        ) {
          for (const [name, value] of Object.entries(options)) {
            if (typeof value === "string") {
              values.push([name.trim(), value.trim()]);
            }
          }
        }
        if (!values.length) return undefined;
        return JSON.stringify(values.sort(([nameA], [nameB]) =>
          nameA.localeCompare(nameB),
        ));
      };

      const matchedExisting = new Set<SanityVariantDocument>();
      const mergedVariants: SanityVariantDocument[] = medusaVariants
        .filter((variant) => typeof variant.id === "string" && variant.id)
        .map((variant) => {
          const optionValues = (variant.options ?? []).flatMap((option) => {
            const optionName =
              typeof option.option === "string"
                ? option.option
                : option.option?.title;
            if (
              typeof optionName !== "string" ||
              !optionName.trim() ||
              typeof option.value !== "string" ||
              !option.value.trim()
            ) {
              return [];
            }
            return [
              {
                _type: "object",
                option: optionName.trim(),
                value: option.value.trim(),
              },
            ];
          });
          const variantTitle =
            (typeof variant.title === "string" && variant.title.trim()) ||
            optionValues.map(({ value }) => value).join(" / ") ||
            "Default Variant";
          const incomingOptionIdentity = optionIdentity(variant.options);
          const existing =
            existingByMedusaId.get(variant.id) ??
            (variant.sanity_variant_id
              ? existingByMedusaId.get(variant.sanity_variant_id)
              : undefined) ??
            (variant.sku
              ? existingVariants.find(
                  (candidate) =>
                    !matchedExisting.has(candidate) &&
                    candidate.sku === variant.sku,
                )
              : undefined) ??
            (incomingOptionIdentity
              ? existingVariants.find(
                  (candidate) =>
                    !matchedExisting.has(candidate) &&
                    optionIdentity(candidate.options ?? candidate.optionValues) ===
                      incomingOptionIdentity,
                )
              : undefined);
          if (existing) matchedExisting.add(existing);
          const addOptionKeys = (
            previous: unknown,
            prefix: string,
          ): SanityVariantOption[] =>
            optionValues.map((option, index) => {
              const matching = Array.isArray(previous)
                ? previous.find(
                    (candidate) =>
                      typeof candidate === "object" &&
                      candidate !== null &&
                      !Array.isArray(candidate) &&
                      (candidate as Record<string, unknown>).option ===
                        option.option &&
                      (candidate as Record<string, unknown>).value ===
                        option.value,
                  )
                : undefined;
              const previousKey =
                typeof matching === "object" &&
                matching !== null &&
                !Array.isArray(matching) &&
                typeof (matching as Record<string, unknown>)._key === "string"
                  ? ((matching as Record<string, string>)._key ?? "")
                  : "";
              return {
                ...option,
                _type: "object" as const,
                _key:
                  previousKey ||
                  makeArrayKey(
                    prefix,
                    `${variant.id}:${index}:${option.option}`,
                  ),
              };
            });
          const keyedOptions = addOptionKeys(existing?.options, "option");
          const keyedOptionValues = addOptionKeys(
            existing?.optionValues ?? existing?.options,
            "option_value",
          );
          const existingImages = Array.isArray(existing?.images)
            ? existing.images.map((image, index) => {
                if (
                  typeof image !== "object" ||
                  image === null ||
                  Array.isArray(image)
                ) {
                  return image;
                }
                const imageRecord = image as Record<string, unknown>;
                return {
                  ...imageRecord,
                  _key:
                    typeof imageRecord._key === "string" &&
                    imageRecord._key.trim()
                      ? imageRecord._key
                      : makeArrayKey("image", `${variant.id}:${index}`),
                };
              })
            : existing?.images;

          return {
            ...(existing ?? {}),
            _type: "object",
            _key: variant.id,
            medusa_variant_id: variant.id,
            variantId: variant.id,
            sku: variant.sku ?? "",
            title: variantTitle,
            options: keyedOptions,
            optionValues: keyedOptionValues,
            ...(existingImages ? { images: existingImages } : {}),
          } satisfies SanityVariantDocument;
        });
      const retainedUnmatchedVariants = existingVariants.filter((variant) => {
        if (matchedExisting.has(variant)) return false;
        const medusaVariantId = variant.medusa_variant_id;
        if (typeof medusaVariantId === "string" && medusaVariantId) {
          return currentMedusaIds.has(medusaVariantId);
        }
        const legacyVariantId = variant.variantId;
        if (typeof legacyVariantId === "string" && legacyVariantId) {
          return currentMedusaIds.has(legacyVariantId);
        }
        return true;
      });
      mergedVariants.push(...retainedUnmatchedVariants);

      const getOptionStructure = (
        options: unknown,
      ): Array<SanityVariantOption & { _key?: string }> => {
        if (Array.isArray(options)) {
          return options.flatMap((option) => {
            if (
              typeof option !== "object" ||
              option === null ||
              Array.isArray(option)
            ) {
              return [];
            }
            const record = option as Record<string, unknown>;
            return typeof record.option === "string" &&
              typeof record.value === "string"
              ? [{
                  _key:
                    typeof record._key === "string" ? record._key : undefined,
                  option: record.option,
                  value: record.value,
                }]
              : [];
          });
        }
        if (typeof options === "object" && options !== null) {
          return Object.entries(options).flatMap(([option, value]) =>
            typeof value === "string" ? [{ option, value }] : [],
          );
        }
        return [];
      };
      const getStructure = (variants: SanityVariantDocument[]) =>
        variants.map((variant) => ({
          _key: variant._key,
          id: variant.medusa_variant_id || variant.variantId || variant._key,
          sku: variant.sku ?? "",
          title: variant.title ?? "",
          options: getOptionStructure(variant.options ?? variant.optionValues),
          imageKeys: Array.isArray(variant.images)
            ? variant.images.map((image) =>
                typeof image === "object" &&
                image !== null &&
                !Array.isArray(image) &&
                typeof (image as Record<string, unknown>)._key === "string"
                  ? (image as Record<string, unknown>)._key
                  : undefined,
              )
            : [],
        }));

      if (
        JSON.stringify(getStructure(existingVariants)) ===
        JSON.stringify(getStructure(mergedVariants))
      ) {
        return {
          changed: false,
          reason: "unchanged",
          variantCount: mergedVariants.length,
        };
      }

      const correlationId = randomUUID();
      await syncLock.mark(`sanity-echo:${sanityDocId}`, correlationId, 30);
      try {
        await this.mutate([
          {
            patch: {
              id: sanityDocId,
              set: {
                variants: mergedVariants,
                updatedBy: "medusa",
                syncOrigin: "medusa",
                correlationId,
              },
            },
          },
        ]);
      } catch (error) {
        await syncLock.consume(`sanity-echo:${sanityDocId}`);
        throw error;
      }

      return {
        changed: true,
        reason: "updated",
        variantCount: mergedVariants.length,
      };
    } finally {
      await syncLock.release(lockKey, leaseToken);
    }
  }
}