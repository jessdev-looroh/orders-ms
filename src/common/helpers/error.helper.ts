// common/helpers/error.helper.ts
import { AppError } from '../interfaces/app-error.interface';
import { RpcException } from '@nestjs/microservices';

export function createRpcError(
  message: string,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  details?: any,
  context?: string,
): RpcException {
  const error: AppError = {
    statusCode,
    code,
    message,
    details,
    context,
    timestamp: new Date().toISOString(),
  };

  return new RpcException(error);
}
