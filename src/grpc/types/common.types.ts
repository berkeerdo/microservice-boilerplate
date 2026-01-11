/**
 * Common gRPC Types & Helpers
 * Shared types and utility functions used across all gRPC handlers
 */
import type * as grpc from '@grpc/grpc-js';

/**
 * gRPC callback type
 */
export type GrpcCallback<T> = (error: grpc.ServiceError | null, response?: T) => void;

/**
 * Generic response for simple success/fail operations
 */
export interface GenericResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Create a gRPC error
 */
export function createGrpcError(code: grpc.status, message: string): grpc.ServiceError {
  const error = new Error(message) as grpc.ServiceError;
  error.code = code;
  error.details = message;
  return error;
}

/**
 * Helper to split name into first/last name
 * Handles undefined/null/empty names gracefully
 */
export function splitName(name?: string | null): { firstName: string; lastName: string } {
  if (!name) {
    return { firstName: '', lastName: '' };
  }

  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}
