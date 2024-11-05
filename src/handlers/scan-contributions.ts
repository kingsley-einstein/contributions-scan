import { Context } from "../types";

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
    const pullRequestReviewsEvents = await octokit.paginate(octokit.pulls.listReviews, { owner, repo, pull_number: issueNumber });
    const issueReactionEvents = await octokit.paginate(octokit.reactions.listForIssue, { owner, repo, issue_number: issueNumber });

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

    pullRequestReviewsEvents.forEach((ev) => {
      const eventName = "review[".concat(ev.state.toLowerCase()).concat("]");
      if (ev.user && store[ev.user.login]) {
        if (!store[ev.user.login][eventName]) store[ev.user.login][eventName] = 1;
        else store[ev.user.login][eventName] += 1;
      }
    });

    issueReactionEvents.forEach((ev) => {
      const eventName = "reaction_" + ev.content;
      if (ev.user && store[ev.user.login]) {
        if (!store[ev.user.login][eventName]) store[ev.user.login][eventName] = 1;
        else store[ev.user.login][eventName] += 1;
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
