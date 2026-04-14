import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";
import { validateUploadFile } from "@/lib/server/next/upload-rules";

const SHARED_ALLOWED_MIME_TYPES = new Set(["image/png", "video/mp4", "video/webm", "video/quicktime"]);
const SHARED_ALLOWED_EXTENSIONS = new Set([".png", ".mp4", ".webm", ".mov"]);

export async function GET(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  try {
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    const rows = await ctx.sharedFileService.listSharedFiles({
      actorUsername: auth.payload.session.username,
      actorRole,
      actorDepartment: actorRole === "student" ? await ctx.getSessionUserDepartment(auth.payload) : "",
    });
    return NextResponse.json(rows);
  } catch (_err) {
    return jsonError(500, "Could not load shared files");
  }
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request, { teacher: true });
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (_err) {
    return jsonError(400, "Could not process shared file upload.");
  }

  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const fileValue = form.get("file");
  const file = fileValue instanceof File ? fileValue : null;
  const validationError = validateUploadFile({
    file,
    missingFileMessage: "Please select a shared file to upload.",
    tooLargeMessage: "Shared file cannot be larger than 50 MB.",
    invalidTypeMessage: "Only PNG images and MP4/WEBM/MOV videos are allowed for shared files.",
    maxBytes: 50 * 1024 * 1024,
    allowedMimeTypes: SHARED_ALLOWED_MIME_TYPES,
    allowedExtensions: SHARED_ALLOWED_EXTENSIONS,
  });
  if (validationError) {
    return jsonError(400, validationError);
  }

  if (!title || !description) {
    return jsonError(400, "Title and description are required.");
  }
  if (title.length > 120 || description.length > 2000) {
    return jsonError(400, "Shared file field length is invalid.");
  }

  const parsedFile = await ctx.parseFormFile(file);
  if (!parsedFile) {
    return jsonError(400, "Please select a shared file to upload.");
  }

  try {
    const targetDepartment = await ctx.resolveContentTargetDepartment(
      auth.payload,
      String(form.get("targetDepartment") || "")
    );
    const uploaded = await ctx.storeUploadedContentFile({
      category: "shared",
      actorUsername: auth.payload.session.username,
      actorRole: auth.payload.session.role,
      file: parsedFile,
    });
    const payload = await ctx.sharedFileService.createSharedFile({
      req: ctx.toReqLike(auth.payload, request),
      actorUsername: auth.payload.session.username,
      title,
      description,
      fileUrl: uploaded.legacyUrl,
      targetDepartment,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not save shared file.");
  }
}
