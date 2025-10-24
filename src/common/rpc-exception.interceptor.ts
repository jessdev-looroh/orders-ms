import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { catchError, Observable, throwError, TimeoutError } from 'rxjs';
import { AppError } from './interfaces/app-error.interface';

@Injectable()
export class RpcExceptionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        console.log('[Order-MS-RpcExceptionInterceptor]');
        //? Case 1: Is RpcException instance
        if (err instanceof RpcException) return throwError(() => err);

        //? Case 2: Microservice Timeout
        // if (err instanceof TimeoutError) {
        //   const error: AppError = {
        //     statusCode: 503,
        //     code: 'SERVICE_TIMEOUT',
        //     message: 'El microservicio no respondió a tiempo.',
        //     context: context.getClass().name,
        //     timestamp: new Date().toISOString(),
        //   };
        //   return throwError(() => new RpcException(error));
        // }

        const appError: AppError = this.formatError(err, context);
        return throwError(() => new RpcException(appError));
      }),
    );
  }
  private formatError(exception: any, context: ExecutionContext): AppError {
    const timestamp = new Date().toLocaleString('es-PE', {
      timeZone: 'America/Lima',
    });

    // Si es una excepción HTTP (Nest estándar)
    if (exception instanceof TimeoutError) {
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse?.();
      let details: Record<string, any> | string[] | undefined;

      if (typeof response === 'object' && response !== null) {
        // Extrae los "message" de class-validator si existen
        details = (response as any).message || response;
      }

      return {
        statusCode: exception.getStatus(),
        code: this.mapStatusToCode(exception),
        message:
          (response as any)?.message || exception.message || 'Error inesperado',
        details,
        context: context.getClass().name,
        timestamp,
      };
    }

    if (typeof exception?.message === 'string') {
      if (
        exception.message.includes('No connection to NATS') ||
        exception.message.includes('ECONNREFUSED') ||
        exception.message.includes('Empty response. There are no subscribers')
      ) {
        const error: AppError = {
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE',
          message:
            'El microservicio requerido no está disponible o no hay conexión.',
          context: context.getClass().name,
          timestamp: new Date().toISOString(),
        };
        return error;
      }
    }

    // Cualquier otro tipo de error (por ejemplo, error del sistema)
    return {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: exception?.message || 'Error interno del servidor',
      details: exception?.stack,
      context: context.getClass().name,
      timestamp,
    };
  }

  private mapStatusToCode(exception: HttpException): string {
    const status = exception.getStatus();
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
