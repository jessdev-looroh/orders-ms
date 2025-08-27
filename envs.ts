import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
}

const envSchema = joi
  .object({
    PORT: joi.number().required(),
  })
  .unknown(true);

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const envVars: EnvVars = env;

export const envs = {
  port: envVars.PORT,
};
