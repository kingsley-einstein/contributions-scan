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
    const issueReactionEvents = await octokit.paginate(octokit.reactions.listForIssue, { owner, repo, issue_number: issueNumber });
    const issueCommentEvents = await octokit.paginate(octokit.issues.listComments, { owner, repo, issue_number: issueNumber });

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

    issueReactionEvents.forEach((ev) => {
      if (ev.user && store[ev.user.login]) {
        if (!store[ev.user.login][ev.content]) store[ev.user.login][ev.content] = 1;
        else store[ev.user.login][ev.content] += 1;
      }
    });

    for (const issueCommentEvent of issueCommentEvents) {
      const reactions = await octokit.paginate(octokit.reactions.listForIssueComment, { owner, repo, comment_id: issueCommentEvent.id });

      reactions.forEach((reaction) => {
        if (reaction.user && store[reaction.user.login]) {
          if (!store[reaction.user.login][reaction.content]) store[reaction.user.login][reaction.content] = 1;
          else store[reaction.user.login][reaction.content] += 1;
        }
      });
    }

    if (payload.issue.pull_request) {
      const pullReviews = await octokit.paginate(octokit.pulls.listReviews, { owner, repo, pull_number: issueNumber });
      const pullReviewComments = await octokit.paginate(octokit.pulls.listReviewComments, { owner, repo, pull_number: issueNumber });

      for (const pullReview of pullReviews) {
        if (pullReview.user && store[pullReview.user.login]) {
          if (!store[pullReview.user.login][pullReview.state]) store[pullReview.user.login][pullReview.state] = 1;
          else store[pullReview.user.login][pullReview.state] += 1;
        }

        const reactions = await octokit.paginate(octokit.reactions.listForPullRequestReviewComment, { owner, repo, comment_id: pullReview.id });

        reactions.forEach((reaction) => {
          if (reaction.user && store[reaction.user.login]) {
            if (!store[reaction.user.login][reaction.content]) store[reaction.user.login][reaction.content] = 1;
            else store[reaction.user.login][reaction.content] += 1;
          }
        });
      }

      for (const pullReviewComment of pullReviewComments) {
        const identifier = "response_to_review_" + pullReviewComment.pull_request_review_id;

        if (pullReviewComment.user && store[pullReviewComment.user.login]) {
          if (!store[pullReviewComment.user.login][identifier]) store[pullReviewComment.user.login][identifier] = 1;
          else store[pullReviewComment.user.login][identifier] += 1;
        }

        const reactions = await octokit.paginate(octokit.reactions.listForPullRequestReviewComment, { owner, repo, comment_id: pullReviewComment.id });

        reactions.forEach((reaction) => {
          if (reaction.user && store[reaction.user.login]) {
            if (!store[reaction.user.login][reaction.content]) store[reaction.user.login][reaction.content] = 1;
            else store[reaction.user.login][reaction.content] += 1;
          }
        });
      }
    }

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
      const octokitCommentBody =
        "An error occured while scanning this repository\n ```json\n" + JSON.stringify({ error: error, stack: error.stack }, undefined, 2) + "\n```";
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: octokitCommentBody,
      });
      logger.error(`Error creating comment:`, { error: error, stack: error.stack });
      throw error;
    } else {
      const octokitCommentBody =
        "An error occured while scanning this repository\n ```json\n" + JSON.stringify({ err: error, error: new Error() }, undefined, 2) + "\n```";
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: octokitCommentBody,
      });
      logger.error(`Error creating comment:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully scanned contributions!`, { repo, issueNumber });
  logger.verbose(`Exiting scanContributions`);
}
