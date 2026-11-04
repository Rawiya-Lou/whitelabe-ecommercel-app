import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

const getPlaceholderPath = (): string | undefined =>
  [
    path.resolve(process.cwd(), "static", "placeholder.png"),
    path.resolve(process.cwd(), "apps", "backend", "static", "placeholder.png"),
    path.resolve(
      process.cwd(),
      ".medusa",
      "server",
      "static",
      "placeholder.png",
    ),
  ].find(existsSync);

export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const placeholderPath = getPlaceholderPath();
  if (!placeholderPath) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA,
      "The required static/placeholder.png asset was not found in the backend deployment.",
    );
  }

  const image = await readFile(placeholderPath);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("Content-Length", image.byteLength);
  res.status(200).send(image);
}
