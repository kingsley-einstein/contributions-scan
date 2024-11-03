import { Context } from "../types";

/**
 * NOTICE: Remove this file or use it as a template for your own plugins.
 *
 * This encapsulates the logic for a plugin if the only thing it does is say "Hello, world!".
 *
 * Try it out by running your local kernel worker and running the `yarn worker` command.
 * Comment on an issue in a repository where your GitHub App is installed and see the magic happen!
 *
 * Logger examples are provided to show how to log different types of data.
 */
export async function scanContributions(context: Context) {
  const { logger, payload, octokit } = context;

  const store: Record<string, Record<string, number>> = {};

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  const owner = payload.repository.owner.login;
  const body = payload.comment.body;

  if (!body.match(/scan-contributions/i)) {
    return;
  }

  logger.info("Scanning Events!");

  try {
    const contributors = await octokit.repos.listContributors({
      repo,
      owner,
    });

    contributors.data.forEach((contributor) => {
      if (contributor.login) {
        store[contributor.login] = {};
      }
    });

    const issueTimelineEvents = await octokit.paginate(octokit.issues.listEventsForTimeline, { owner, repo, issue_number: issueNumber });
    const issueEvents = await octokit.paginate(octokit.issues.listEvents, { owner, repo, issue_number: issueNumber });

    issueTimelineEvents.forEach((ev) => {
      if ("actor" in ev && ev.actor && store[ev.actor.login]) {
        if (!store[ev.actor.login][ev.event]) store[ev.actor.login][ev.event] = 1;
        else store[ev.actor.login][ev.event] += 1;
      }
    });

    issueEvents.forEach((ev) => {
      if (ev.actor && store[ev.actor.login] && !issueTimelineEvents.map((te) => te.event).includes(ev.event)) {
        if (!store[ev.actor.login][ev.event]) store[ev.actor.login][ev.event] = 1;
        else store[ev.actor.login][ev.event] += 1;
      }
    });

    // In MD format
    const octokitCommentBody = "```json\n" + JSON.stringify(store, undefined, 2) + "\n```";

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: octokitCommentBody,
    });
  } catch (error) {
    /**
     * logger.fatal should not be used in 9/10 cases. Use logger.error instead.
     *
     * Below are examples of passing error objects to the logger, only one is needed.
     */
    if (error instanceof Error) {
      logger.error(`Error creating comment:`, { error: error, stack: error.stack });
      throw error;
    } else {
      logger.error(`Error creating comment:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully created comment!`);
  logger.verbose(`Exiting scanContributions`);
}
