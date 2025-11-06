import cron from "node-cron";
import { readFileSync } from "fs";
import { resolve } from "path";

export interface CronJobConfig {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  timezone?: string;
}

export interface CronConfig {
  jobs: CronJobConfig[];
}

export interface JobStatus {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
  timezone?: string;
  isRunning: boolean;
  lastStartTime?: Date;
  lastEndTime?: Date;
  executionCount: number;
}

class CronScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private jobStatus: Map<string, JobStatus> = new Map();
  private config: CronConfig | null = null;

  /**
   * Load cron jobs configuration from file
   */
  loadConfig(configPath: string): void {
    try {
      const configFile = readFileSync(resolve(configPath), "utf-8");
      this.config = JSON.parse(configFile) as CronConfig;
      console.log(`[Scheduler] Loaded ${this.config.jobs.length} job(s) from config`);
    } catch (error) {
      console.error("[Scheduler] Failed to load config:", error);
      throw error;
    }
  }

  /**
   * Initialize and start all enabled cron jobs
   */
  initializeJobs(): void {
    if (!this.config) {
      throw new Error("Config not loaded. Call loadConfig() first.");
    }

    for (const jobConfig of this.config.jobs) {
      if (!jobConfig.enabled) {
        console.log(`[Scheduler] Skipping disabled job: ${jobConfig.name}`);
        continue;
      }

      try {
        // Validate cron expression
        if (!cron.validate(jobConfig.schedule)) {
          console.error(`[Scheduler] Invalid cron expression for job ${jobConfig.name}: ${jobConfig.schedule}`);
          continue;
        }

        // Initialize job status
        this.jobStatus.set(jobConfig.name, {
          name: jobConfig.name,
          schedule: jobConfig.schedule,
          description: jobConfig.description,
          enabled: jobConfig.enabled,
          timezone: jobConfig.timezone,
          isRunning: false,
          executionCount: 0,
        });

        // Create cron task
        const task = cron.schedule(
          jobConfig.schedule,
          async () => {
            await this.executeJob(jobConfig.name);
          },
          {
            timezone: jobConfig.timezone || "UTC",
          }
        );

        this.jobs.set(jobConfig.name, task);
        console.log(`[Scheduler] Started job: ${jobConfig.name} with schedule: ${jobConfig.schedule}`);
      } catch (error) {
        console.error(`[Scheduler] Failed to initialize job ${jobConfig.name}:`, error);
      }
    }
  }

  /**
   * Execute a job and track its status
   */
  private async executeJob(jobName: string): Promise<void> {
    const status = this.jobStatus.get(jobName);
    if (!status) {
      console.error(`[Scheduler] Job status not found: ${jobName}`);
      return;
    }

    // Mark job as running
    status.isRunning = true;
    status.lastStartTime = new Date();
    status.executionCount++;

    console.log(`[Scheduler] Executing job: ${jobName} (execution #${status.executionCount})`);

    try {
      // Call the job handler
      await this.runJobHandler(jobName);
    } catch (error) {
      console.error(`[Scheduler] Job ${jobName} failed:`, error);
    } finally {
      // Mark job as finished
      status.isRunning = false;
      status.lastEndTime = new Date();
      console.log(`[Scheduler] Completed job: ${jobName}`);
    }
  }

  /**
   * Override this method or register handlers to define job logic
   */
  private async runJobHandler(jobName: string): Promise<void> {
    // Default implementation - can be extended by registering handlers
    console.log(`[Scheduler] Running job: ${jobName}`);

    // Example job logic based on job name
    switch (jobName) {
      case "daily-cleanup":
        await this.dailyCleanupTask();
        break;
      case "hourly-sync":
        await this.hourlySyncTask();
        break;
      default:
        console.log(`[Scheduler] No handler defined for job: ${jobName}`);
    }
  }

  /**
   * Example job handlers
   */
  private async dailyCleanupTask(): Promise<void> {
    console.log("[Scheduler] Running daily cleanup task...");
    // Add your cleanup logic here
    // Example: delete old messages, clean up expired sessions, etc.
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
  }

  private async hourlySyncTask(): Promise<void> {
    console.log("[Scheduler] Running hourly sync task...");
    // Add your sync logic here
    // Example: sync with external services, update caches, etc.
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
  }

  /**
   * Get all job statuses
   */
  getAllJobStatus(): JobStatus[] {
    return Array.from(this.jobStatus.values());
  }

  /**
   * Get currently running jobs
   */
  getRunningJobs(): JobStatus[] {
    return Array.from(this.jobStatus.values()).filter(status => status.isRunning);
  }

  /**
   * Get status of a specific job
   */
  getJobStatus(jobName: string): JobStatus | undefined {
    return this.jobStatus.get(jobName);
  }

  /**
   * Stop a specific job
   */
  stopJob(jobName: string): boolean {
    const task = this.jobs.get(jobName);
    if (task) {
      task.stop();
      const status = this.jobStatus.get(jobName);
      if (status) {
        status.enabled = false;
      }
      console.log(`[Scheduler] Stopped job: ${jobName}`);
      return true;
    }
    return false;
  }

  /**
   * Start a specific job
   */
  startJob(jobName: string): boolean {
    const task = this.jobs.get(jobName);
    if (task) {
      task.start();
      const status = this.jobStatus.get(jobName);
      if (status) {
        status.enabled = true;
      }
      console.log(`[Scheduler] Started job: ${jobName}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const [name, task] of this.jobs) {
      task.stop();
      console.log(`[Scheduler] Stopped job: ${name}`);
    }
  }

  /**
   * Destroy the scheduler and clean up
   */
  destroy(): void {
    this.stopAll();
    this.jobs.clear();
    this.jobStatus.clear();
    console.log("[Scheduler] Scheduler destroyed");
  }
}

// Singleton instance
const scheduler = new CronScheduler();

export default scheduler;
