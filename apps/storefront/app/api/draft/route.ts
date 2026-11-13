import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const slug = searchParams.get("slug") || "/";

  if (secret !== process.env.PREVIEW_SECRET) {
    return new NextResponse("Invalid preview token", { status: 401 });
  }

  const draft = await draftMode();
  draft.enable();

  // Redirect to the target page to view draft content
  redirect(slug);
}