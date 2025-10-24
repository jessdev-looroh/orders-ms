// common/interfaces/app-error.interface.ts
export interface AppError {
    /** Código de estado HTTP estándar */
    statusCode: number;
  
    /** Código interno opcional (por ejemplo, 'USER_NOT_FOUND', 'INVALID_DTO') */
    code?: string;
  
    /** Mensaje principal para mostrar al cliente */
    message: string;
  
    /** Detalles adicionales del error (por ejemplo, errores de validación) */
    details?: Record<string, any> | string[];
  
    /** Contexto del servicio o módulo que generó el error */
    context?: string;
  
    /** Marca de tiempo */
    timestamp: string;
  
    /** Opcional: identificador de correlación para trazabilidad */
    correlationId?: string;
  }
  