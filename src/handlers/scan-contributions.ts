import { Context } from "../types";

export async function scanContributions(context: Context) {
  const { logger, payload, octokit } = context;

  const store: Record<string, Record<string, number>> = {};

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  const owner = payload.repository.owner.login;
  const body = payload.comment.body;

  if (!body.match(/scanContributions/i)) {
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
    const issueReviewsEvents = payload.issue.pull_request
      ? await octokit.paginate(octokit.pulls.listReviews, { owner, repo, pull_number: issueNumber })
      : await octokit.paginate(octokit.issues.listComments, { owner, repo, issue_number: issueNumber });
    const issueReactionEvents = await octokit.paginate(octokit.reactions.listForIssue, { owner, repo, issue_number: issueNumber });
    const issueCommentsReactionEvents = await Promise.all(
      (await octokit.paginate(octokit.issues.listComments, { owner, repo, issue_number: issueNumber })).map((comment) =>
        octokit.paginate(octokit.reactions.listForIssueComment, { owner, repo, comment_id: comment.id })
      )
    );
    const issueReviewCommentsReactionEvents = payload.issue.pull_request
      ? await Promise.all(
          (await octokit.paginate(octokit.pulls.listReviews, { owner, repo, pull_number: issueNumber })).map((comment) =>
            octokit.paginate(octokit.reactions.listForIssueComment, { owner, repo, comment_id: comment.id })
          )
        )
      : await Promise.all(
          (await octokit.paginate(octokit.issues.listComments, { owner, repo, issue_number: issueNumber })).map((comment) =>
            octokit.paginate(octokit.reactions.listForIssueComment, { owner, repo, comment_id: comment.id })
          )
        );

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

    issueReviewsEvents.forEach((ev) => {
      const identifier = "state" in ev ? ev.state : "commented";
      if (ev.user && store[ev.user.login]) {
        if (!store[ev.user.login][identifier]) store[ev.user.login][identifier] = 1;
        else store[ev.user.login][identifier] += 1;
      }
    });

    issueReactionEvents.forEach((ev) => {
      if (ev.user && store[ev.user.login]) {
        if (!store[ev.user.login][ev.content]) store[ev.user.login][ev.content] = 1;
        else store[ev.user.login][ev.content] += 1;
      }
    });

    issueCommentsReactionEvents.forEach((event) => {
      event.forEach((ev) => {
        if (ev.user && store[ev.user.login]) {
          if (!store[ev.user.login][ev.content]) store[ev.user.login][ev.content] = 1;
          else store[ev.user.login][ev.content] += 1;
        }
      });
    });
    issueReviewCommentsReactionEvents.forEach((event) => {
      event.forEach((ev) => {
        if (ev.user && store[ev.user.login]) {
          if (!store[ev.user.login][ev.content]) store[ev.user.login][ev.content] = 1;
          else store[ev.user.login][ev.content] += 1;
        }
      });
    });

    logger.info("Contributions stats: ", store);
    const octokitCommentBody = "```json\n" + JSON.stringify(store, undefined, 2) + "\n```";

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: octokitCommentBody,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error creating comment:`, { error: error, stack: error.stack });
      throw error;
    } else {
      logger.error(`Error creating comment:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully scanned contributions!`, { repo, issueNumber });
  logger.verbose(`Exiting scanContributions`);
}
