import { drop } from "@mswjs/data";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it } from "@jest/globals";
import { Context } from "../src/types/context";
import { Octokit } from "@octokit/rest";
import { STRINGS } from "./__mocks__/strings";
import { createComment, setupTests } from "./__mocks__/helpers";
import manifest from "../manifest.json";
import dotenv from "dotenv";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Env } from "../src/types";
import { runPlugin } from "../src/plugin";

const ISSUE_COMMENT_CREATED = "issue_comment.created";

dotenv.config();
jest.requireActual("@octokit/rest");
const octokit = new Octokit();

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

describe("Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should serve the manifest file", async () => {
    const worker = (await import("../src/worker")).default;
    const response = await worker.fetch(new Request("http://localhost/manifest"), {});
    const content = await response.json();
    expect(content).toEqual(manifest);
  });

  it("Should handle an issue comment /scan-contributions", async () => {
    const issues = db.issue.getAll();
    const issueNumber = issues[issues.length - 1].number;

    // Create contexts for comments prior to command context
    createContext(STRINGS.CONFIGURABLE_RESPONSE, "Hello world", 1, 1, 2, issueNumber);
    createContext(STRINGS.CONFIGURABLE_RESPONSE, "Hello world, again!", 1, 2, 3, issueNumber);
    createContext(STRINGS.CONFIGURABLE_RESPONSE, "Hello world, for the third time.", 1, 1, 4, issueNumber);

    const { context, infoSpy } = createContext(STRINGS.CONFIGURABLE_RESPONSE, "/scan-contributions", 1, 1, 1, issueNumber);

    expect(context.eventName).toBe(ISSUE_COMMENT_CREATED);
    expect(context.payload.comment.body).toBe("/scan-contributions");

    await runPlugin(context);
    expect(infoSpy).toHaveBeenNthCalledWith(1, STRINGS.SCANNING_EVENTS);

    const comments = db.issueEvents.getAll();
    expect(comments.map((comment) => comment.event)).toContain(ISSUE_COMMENT_CREATED);
  });
});

/**
 * The heart of each test. This function creates a context object with the necessary data for the plugin to run.
 *
 * So long as everything is defined correctly in the db (see `./__mocks__/helpers.ts: setupTests()`),
 * this function should be able to handle any event type and the conditions that come with it.
 *
 * Refactor according to your needs.
 */
function createContext(
  configurableResponse: string = "Hello, world!", // we pass the plugin configurable items here
  commentBody: string = "/Hello",
  repoId: number = 1,
  payloadSenderId: number = 1,
  commentId: number = 1,
  issueOne: number = 1
) {
  const repo = db.repo.findFirst({ where: { id: { equals: repoId } } }) as unknown as Context["payload"]["repository"];
  const sender = db.users.findFirst({ where: { id: { equals: payloadSenderId } } }) as unknown as Context["payload"]["sender"];
  const issue1 = db.issue.findFirst({ where: { id: { equals: issueOne } } }) as unknown as Context["payload"]["issue"];

  createComment(commentBody, commentId, sender.id, issue1.number); // create it first then pull it from the DB and feed it to _createContext
  const comment = db.issueComments.findFirst({ where: { id: { equals: commentId } } }) as unknown as Context["payload"]["comment"];

  const context = createContextInner(repo, sender, issue1, comment, configurableResponse);
  const infoSpy = jest.spyOn(context.logger, "info");
  const errorSpy = jest.spyOn(context.logger, "error");
  const debugSpy = jest.spyOn(context.logger, "debug");
  const okSpy = jest.spyOn(context.logger, "ok");
  const verboseSpy = jest.spyOn(context.logger, "verbose");

  return {
    context,
    infoSpy,
    errorSpy,
    debugSpy,
    okSpy,
    verboseSpy,
    repo,
    issue1,
  };
}

/**
 * Creates the context object central to the plugin.
 *
 * This should represent the active `SupportedEvents` payload for any given event.
 */
function createContextInner(
  repo: Context["payload"]["repository"],
  sender: Context["payload"]["sender"],
  issue: Context["payload"]["issue"],
  comment: Context["payload"]["comment"],
  configurableResponse: string
): Context {
  return {
    eventName: "issue_comment.created",
    payload: {
      action: "created",
      sender: sender,
      repository: repo,
      issue: issue,
      comment: comment,
      installation: { id: 1 } as Context["payload"]["installation"],
      organization: { login: STRINGS.USER_1 } as Context["payload"]["organization"],
    } as Context["payload"],
    logger: new Logs("debug"),
    config: {
      configurableResponse,
    },
    env: {} as Env,
    octokit: octokit,
  };
}
