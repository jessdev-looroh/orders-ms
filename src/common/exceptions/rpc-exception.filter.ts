import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

interface ExceptionObject {
  statusCode: number;
  message: string;
}

@Catch(RpcException, BadRequestException)
export class RpcCustomExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException | BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const exceptionObject: ExceptionObject =
      exception instanceof RpcException
        ? (exception.getError() as ExceptionObject)
        : {
            statusCode: HttpStatus.BAD_REQUEST,
            message: exception.getResponse()['message'],
          };

    const status = exceptionObject.statusCode;

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exceptionObject.message,
    });
  }
}
