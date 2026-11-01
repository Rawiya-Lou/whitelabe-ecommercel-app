import { MedusaError, MedusaService } from "@medusajs/framework/utils";

type SanityModuleOptions = {
  api_token: string;
  project_id: string;
  dataset: string;
  api_version?: string;
};

export default class SanityModuleService extends MedusaService({}) {
  protected options_: SanityModuleOptions;

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

  async query(groq: string, params: Record<string, any> = {}) {
    const { projectId, dataset, token, apiVersion } = this.clientConfig;
    const searchParams = new URLSearchParams({
      query: groq,
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [`$${k}`, JSON.stringify(v)])
      ),
    });

    const res = await fetch(
      `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}?${searchParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    return data.result;
  }

  async mutate(mutations: object[]) {
    const { projectId, dataset, token, apiVersion } = this.clientConfig;
    const res = await fetch(
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
}