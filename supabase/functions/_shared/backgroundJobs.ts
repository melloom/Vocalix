/**
 * Background Job Processing Utilities
 * Provides utilities for scheduling and processing background jobs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  scheduledFor?: string;
  maxRetries?: number;
  retryCount?: number;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface JobResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Create a background job
 */
export async function createJob(
  supabase: ReturnType<typeof createClient>,
  type: string,
  payload: Record<string, unknown>,
  options: {
    priority?: number;
    scheduledFor?: Date;
    maxRetries?: number;
  } = {}
): Promise<{ id: string; error?: string }> {
  const { priority = 0, scheduledFor, maxRetries = 3 } = options;

  const { data, error } = await supabase
    .from("background_jobs")
    .insert({
      type,
      payload,
      priority,
      scheduled_for: scheduledFor?.toISOString(),
      max_retries: maxRetries,
      retry_count: 0,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return { id: "", error: error.message };
  }

  return { id: data.id };
}

/**
 * Get next pending job
 */
export async function getNextJob(
  supabase: ReturnType<typeof createClient>,
  jobTypes?: string[]
): Promise<Job | null> {
  let query = supabase
    .from("background_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (jobTypes && jobTypes.length > 0) {
    query = query.in("type", jobTypes);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    type: data.type,
    payload: data.payload,
    priority: data.priority,
    scheduledFor: data.scheduled_for,
    maxRetries: data.max_retries,
    retryCount: data.retry_count,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update job status
 */
export async function updateJobStatus(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: Job["status"],
  result?: JobResult
): Promise<{ error?: string }> {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (result) {
    if (result.success) {
      updateData.result_data = result.data;
    } else {
      updateData.error_message = result.error;
      updateData.retry_count = (await getJob(supabase, jobId))?.retryCount || 0;
    }
  }

  const { error } = await supabase
    .from("background_jobs")
    .update(updateData)
    .eq("id", jobId);

  if (error) {
    return { error: error.message };
  }

  return {};
}

/**
 * Get job by ID
 */
export async function getJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string
): Promise<Job | null> {
  const { data, error } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    type: data.type,
    payload: data.payload,
    priority: data.priority,
    scheduledFor: data.scheduled_for,
    maxRetries: data.max_retries,
    retryCount: data.retry_count,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Retry failed job
 */
export async function retryJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string
): Promise<{ error?: string }> {
  const job = await getJob(supabase, jobId);

  if (!job) {
    return { error: "Job not found" };
  }

  if (job.retryCount && job.maxRetries && job.retryCount >= job.maxRetries) {
    return { error: "Max retries exceeded" };
  }

  const { error } = await supabase
    .from("background_jobs")
    .update({
      status: "pending",
      retry_count: (job.retryCount || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    return { error: error.message };
  }

  return {};
}

/**
 * Process a job (generic processor)
 */
export async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: Job,
  processor: (payload: Record<string, unknown>) => Promise<JobResult>
): Promise<JobResult> {
  // Mark job as processing
  await updateJobStatus(supabase, job.id, "processing");

  try {
    // Process the job
    const result = await processor(job.payload);

    // Update job status based on result
    if (result.success) {
      await updateJobStatus(supabase, job.id, "completed", result);
    } else {
      // Check if we should retry
      const retryCount = (job.retryCount || 0) + 1;
      const maxRetries = job.maxRetries || 3;

      if (retryCount < maxRetries) {
        // Retry the job
        await retryJob(supabase, job.id);
      } else {
        // Mark as failed
        await updateJobStatus(supabase, job.id, "failed", result);
      }
    }

    return result;
  } catch (error) {
    const result: JobResult = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };

    // Check if we should retry
    const retryCount = (job.retryCount || 0) + 1;
    const maxRetries = job.maxRetries || 3;

    if (retryCount < maxRetries) {
      await retryJob(supabase, job.id);
    } else {
      await updateJobStatus(supabase, job.id, "failed", result);
    }

    return result;
  }
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(
  supabase: ReturnType<typeof createClient>,
  olderThanDays: number = 30
): Promise<{ deleted: number; error?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data, error } = await supabase
    .from("background_jobs")
    .delete()
    .in("status", ["completed", "failed"])
    .lt("updated_at", cutoffDate.toISOString())
    .select("id");

  if (error) {
    return { deleted: 0, error: error.message };
  }

  return { deleted: data?.length || 0 };
}

