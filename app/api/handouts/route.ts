import { NextResponse } from "next/server";

import { getApiContext } from "@/lib/server/next/api-context";
import { jsonError, toServiceErrorResponse } from "@/lib/server/next/handler-utils";
import { validateUploadFile } from "@/lib/server/next/upload-rules";

const HANDOUT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const HANDOUT_ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);

export async function GET(request: Request) {
  const ctx = await getApiContext();
  const auth = await ctx.requireSession(request);
  if (auth.error) {
    return NextResponse.json(auth.error.body, { status: auth.error.status });
  }

  try {
    const actorRole = String(auth.payload.session.role || "").trim().toLowerCase();
    const rows = await ctx.handoutService.listHandouts({
      actorUsername: auth.payload.session.username,
      actorRole,
      actorDepartment: actorRole === "student" ? await ctx.getSessionUserDepartment(auth.payload) : "",
    });
    return NextResponse.json(rows);
  } catch (_err) {
    return jsonError(500, "Could not load handouts");
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
    return jsonError(400, "Could not process handout upload.");
  }

  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const fileValue = form.get("file");
  const file = fileValue instanceof File ? fileValue : null;

  const validationError = validateUploadFile({
    file,
    missingFileMessage: "Please select a handout file to upload.",
    tooLargeMessage: "Handout file cannot be larger than 20 MB.",
    invalidTypeMessage: "Only PDF, Word, and Excel files are allowed for handouts.",
    maxBytes: 20 * 1024 * 1024,
    allowedMimeTypes: HANDOUT_ALLOWED_MIME_TYPES,
    allowedExtensions: HANDOUT_ALLOWED_EXTENSIONS,
  });
  if (validationError) {
    return jsonError(400, validationError);
  }

  if (!title || !description) {
    return jsonError(400, "Title and description are required.");
  }
  if (title.length > 120 || description.length > 2000) {
    return jsonError(400, "Handout field length is invalid.");
  }

  const parsedFile = await ctx.parseFormFile(file);
  if (!parsedFile) {
    return jsonError(400, "Please select a handout file to upload.");
  }

  try {
    const targetDepartment = await ctx.resolveContentTargetDepartment(
      auth.payload,
      String(form.get("targetDepartment") || "")
    );
    const uploaded = await ctx.storeUploadedContentFile({
      category: "handouts",
      actorUsername: auth.payload.session.username,
      actorRole: auth.payload.session.role,
      file: parsedFile,
    });
    const payload = await ctx.handoutService.createHandout({
      req: ctx.toReqLike(auth.payload, request),
      actorUsername: auth.payload.session.username,
      title,
      description,
      fileUrl: uploaded.legacyUrl,
      targetDepartment,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return toServiceErrorResponse(err, "Could not save handout.");
  }
}
