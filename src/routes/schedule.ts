import { Hono } from "hono";
import type { AppVariables } from "../types.js";
import scheduler from "../scheduler.js";

const app = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/v1/schedule
 * Get all scheduled jobs and their status
 */
app.get("/", async (c) => {
  try {
    const jobs = scheduler.getAllJobStatus();
    return c.json({
      data: jobs,
      total: jobs.length,
    });
  } catch (error) {
    console.error("Failed to get job status", error);
    return c.json({ error: "Failed to get job status" }, 500);
  }
});

/**
 * GET /api/v1/schedule/running
 * Get currently executing jobs
 */
app.get("/running", async (c) => {
  try {
    const runningJobs = scheduler.getRunningJobs();
    return c.json({
      data: runningJobs,
      total: runningJobs.length,
    });
  } catch (error) {
    console.error("Failed to get running jobs", error);
    return c.json({ error: "Failed to get running jobs" }, 500);
  }
});

/**
 * GET /api/v1/schedule/:jobName
 * Get status of a specific job
 */
app.get("/:jobName", async (c) => {
  try {
    const jobName = c.req.param("jobName");
    const jobStatus = scheduler.getJobStatus(jobName);

    if (!jobStatus) {
      return c.json(
        {
          error: "Job not found",
          jobName,
        },
        404,
      );
    }

    return c.json({
      data: jobStatus,
    });
  } catch (error) {
    console.error("Failed to get job status", error);
    return c.json({ error: "Failed to get job status" }, 500);
  }
});

/**
 * POST /api/v1/schedule/:jobName/start
 * Start a specific job
 */
app.post("/:jobName/start", async (c) => {
  try {
    const jobName = c.req.param("jobName");
    const success = scheduler.startJob(jobName);

    if (!success) {
      return c.json(
        {
          error: "Job not found or already running",
          jobName,
        },
        404,
      );
    }

    return c.json({
      message: "Job started successfully",
      jobName,
    });
  } catch (error) {
    console.error("Failed to start job", error);
    return c.json({ error: "Failed to start job" }, 500);
  }
});

/**
 * POST /api/v1/schedule/:jobName/stop
 * Stop a specific job
 */
app.post("/:jobName/stop", async (c) => {
  try {
    const jobName = c.req.param("jobName");
    const success = scheduler.stopJob(jobName);

    if (!success) {
      return c.json(
        {
          error: "Job not found",
          jobName,
        },
        404,
      );
    }

    return c.json({
      message: "Job stopped successfully",
      jobName,
    });
  } catch (error) {
    console.error("Failed to stop job", error);
    return c.json({ error: "Failed to stop job" }, 500);
  }
});

export default app;
