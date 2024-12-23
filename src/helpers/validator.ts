import { Octokit } from "@octokit/rest";
import { TransformDecodeCheckError, TransformDecodeError, Value, ValueError } from "@sinclair/typebox/value";
import { Context, Env, envSchema, envValidator, PluginSettings, pluginSettingsSchema, pluginSettingsValidator } from "../types";

export async function returnDataToKernel(
  repoToken: string,
  stateId: string,
  output: object,
  context: Context,
  eventType = "return-data-to-ubiquity-os-kernel"
) {
  const octokit = new Octokit({ auth: repoToken });
  return octokit.repos.createDispatchEvent({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    event_type: eventType,
    client_payload: {
      state_id: stateId,
      output: JSON.stringify(output),
    },
  });
}

export function validateAndDecodeSchemas(rawEnv: object, rawSettings: object) {
  const errors: ValueError[] = [];

  const env = Value.Default(envSchema, rawEnv) as Env;
  if (!envValidator.test(env)) {
    for (const error of envValidator.errors(env)) {
      console.error(error);
      errors.push(error);
    }
  }

  const settings = Value.Default(pluginSettingsSchema, rawSettings) as PluginSettings;
  if (!pluginSettingsValidator.test(settings)) {
    for (const error of pluginSettingsValidator.errors(settings)) {
      console.error(error);
      errors.push(error);
    }
  }

  if (errors.length) {
    throw { errors };
  }

  try {
    const decodedSettings = Value.Decode(pluginSettingsSchema, settings);
    const decodedEnv = Value.Decode(envSchema, rawEnv || {});
    return { decodedEnv, decodedSettings };
  } catch (e) {
    console.error("validateAndDecodeSchemas", e);
    if (e instanceof TransformDecodeCheckError || e instanceof TransformDecodeError) {
      throw { errors: [e.error] };
    }
    throw e;
  }
}
