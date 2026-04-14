import path from "path";

export type UploadRuleInput = {
  file: File | null;
  missingFileMessage: string;
  tooLargeMessage: string;
  invalidTypeMessage: string;
  maxBytes: number;
  allowedMimeTypes: Set<string>;
  allowedExtensions: Set<string>;
};

export function validateUploadFile(input: UploadRuleInput): string | null {
  if (!input.file) {
    return input.missingFileMessage;
  }
  if (Number(input.file.size || 0) > input.maxBytes) {
    return input.tooLargeMessage;
  }
  const mimeType = String(input.file.type || "").toLowerCase();
  const extension = path.extname(String(input.file.name || "")).toLowerCase();
  if (input.allowedMimeTypes.has(mimeType) || input.allowedExtensions.has(extension)) {
    return null;
  }
  return input.invalidTypeMessage;
}
