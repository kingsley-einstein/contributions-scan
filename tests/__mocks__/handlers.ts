import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueTemplate from "./issue-template";
import { STRINGS } from "./strings";
/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  // get org repos
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }: { params: { org: string } }) =>
    HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org } } } }))
  ),
  // get org repo issues
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) =>
    HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }))
  ),
  // get org repo issue timeline
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number/timeline", ({ params: { issue_number: issueNumber } }) =>
    HttpResponse.json(
      db.issueEvents.findMany({
        where: { issueNumber: { equals: Number(issueNumber) } },
      })
    )
  ),
  // get issue
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number", ({ params: { owner, repo, issue_number: issueNumber } }) =>
    HttpResponse.json(
      db.issue.findFirst({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, number: { equals: Number(issueNumber) } } })
    )
  ),
  // get user
  http.get("https://api.github.com/users/:username", ({ params: { username } }) =>
    HttpResponse.json(db.users.findFirst({ where: { login: { equals: username as string } } }))
  ),
  // get repo
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo }, owner: { login: { equals: owner } } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // get repo contributors
  http.get("https://api.github.com/repos/:owner/:repo/contributors", ({ params: { owner, repo } }) => {
    const repository = db.repo.findFirst({ where: { name: { equals: repo as string }, owner: { login: { equals: owner as string } } } });
    return HttpResponse.json(repository?.contributors);
  }),
  // create issue
  http.post("https://api.github.com/repos/:owner/:repo/issues", () => {
    const id = db.issue.count() + 1;
    const newItem = { ...issueTemplate, id };
    const newIssueEvent = {
      id,
      issueNumber: id,
      event: "issue_created",
      actor: {
        id: 0,
        login: STRINGS.USER_1,
      },
    };
    db.issue.create(newItem);
    db.issueEvents.create(newIssueEvent);
    return HttpResponse.json(newItem);
  }),
  // create comment
  http.post("https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments", async ({ params: { issue_number: issueNumber }, request }) => {
    const { body } = await getValue(request.body);
    const id = db.issueComments.count() + 1;
    const users = db.users.getAll();
    const newItem = { id, body, issue_number: Number(issueNumber), user: users.at(0) };
    db.issueComments.create(newItem);
    return HttpResponse.json(newItem);
  }),
];

async function getValue(body: ReadableStream<Uint8Array> | null) {
  if (body) {
    const reader = body.getReader();
    const streamResult = await reader.read();
    if (!streamResult.done) {
      const text = new TextDecoder().decode(streamResult.value);
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Failed to parse body as JSON", error);
      }
    }
  }
}
