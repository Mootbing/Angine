import { NextRequest } from "next/server";
import { authenticateRequest, errorResponse, successResponse } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/db";

/**
 * POST /api/v1/jobs/upload - Upload a file for a job
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, ["jobs:write"]);
  if (!auth.success) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const jobId = formData.get("jobId") as string | null;

    if (!file) {
      return errorResponse("No file provided", 400, "MISSING_FILE");
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return errorResponse("File too large (max 10MB)", 400, "FILE_TOO_LARGE");
    }

    // Generate storage path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = jobId
      ? `attachments/${jobId}/${timestamp}-${safeName}`
      : `uploads/${auth.context.keyId}/${timestamp}-${safeName}`;

    // Upload to Supabase Storage
    const supabase = getSupabaseAdmin();
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("job-files")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return errorResponse("Failed to upload file", 500, "UPLOAD_ERROR");
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("job-files")
      .getPublicUrl(storagePath);

    // If jobId provided, record in job_attachments table
    if (jobId) {
      await supabase.from("job_attachments").insert({
        job_id: jobId,
        filename: file.name,
        mime_type: file.type,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        size_bytes: file.size,
      });
    }

    return successResponse({
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return errorResponse("Failed to process upload", 500, "INTERNAL_ERROR");
  }
}
