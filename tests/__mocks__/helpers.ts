import { db } from "./db";
import issueTemplate from "./issue-template";
import { STRINGS } from "./strings";
import usersGet from "./users-get.json";

/**
 * Helper function to setup tests.
 *
 * This function populates the mock database with the external API
 * data you'd expect to find in a real-world scenario.
 *
 * Here is where you create issues, commits, pull requests, etc.
 */
export async function setupTests() {
  for (const item of usersGet) {
    db.users.create(item);
  }

  db.repo.create({
    id: 1,
    name: STRINGS.TEST_REPO,
    owner: {
      login: STRINGS.USER_1,
      id: 0,
    },
    issues: [],
    contributors: db.users.getAll(),
  });

  db.issue.create({
    ...issueTemplate,
    number: 1,
    event: "first_issue_created",
    repo: STRINGS.TEST_REPO,
    owner: STRINGS.USER_1,
  });

  db.issueEvents.create({
    id: 1,
    issueNumber: 1,
    event: "issue_created",
    actor: {
      id: 0,
      login: STRINGS.USER_1,
    },
  });

  db.issue.create({
    ...issueTemplate,
    repo: STRINGS.TEST_REPO,
    owner: STRINGS.USER_1,
    id: 2,
    number: 2,
    labels: [],
  });

  db.issueEvents.create({
    id: 2,
    issueNumber: 2,
    event: "issue_created",
    actor: {
      id: 0,
      login: STRINGS.USER_1,
    },
  });

  db.issue.create({
    ...issueTemplate,
    repo: STRINGS.TEST_REPO,
    owner: STRINGS.USER_1,
    id: 3,
    number: 3,
    labels: [],
  });

  db.issueEvents.create({
    id: 3,
    issueNumber: 3,
    event: "issue_created",
    actor: {
      id: 0,
      login: STRINGS.USER_1,
    },
  });

  createComment("/scan-contributions", 1);
}

export function createComment(comment: string, commentId: number, userId: number = 1, issueNumber: number = 1) {
  const isComment = db.issueComments.findFirst({
    where: {
      id: {
        equals: commentId,
      },
    },
  });

  if (isComment) {
    db.issueComments.update({
      where: {
        id: {
          equals: commentId,
        },
      },
      data: {
        body: comment,
      },
    });
  } else {
    const user = db.users.findFirst({ where: { id: { equals: userId } } });
    const events = db.issueEvents.getAll();
    db.issueComments.create({
      id: commentId,
      body: comment,
      issue_number: issueNumber,
      user: {
        login: user?.login,
        id: user?.id,
      },
    });
    db.issueEvents.create({
      id: events[events.length - 1].id + 1,
      issueNumber,
      event: "issue_comment.created",
      actor: {
        id: user?.id,
        login: user?.login,
      },
    });
  }
}
