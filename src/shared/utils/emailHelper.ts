/**
 * Email Helper Utilities
 *
 * Provides fire-and-forget email sending with proper error handling.
 * Used when email failures shouldn't block the main operation.
 */
import logger from '../../infra/logger/logger.js';

/**
 * Context for email sending (for logging purposes)
 */
export interface EmailContext {
  /** Email type for logging (e.g., 'verification', 'password-reset') */
  emailType: string;
  /** Recipient email address */
  to?: string;
  /** User ID if available */
  userId?: number;
  /** Additional context for logging */
  [key: string]: unknown;
}

/**
 * Send email in fire-and-forget mode
 *
 * Handles errors gracefully by logging and not throwing.
 * The main operation continues even if email fails.
 * User can typically retry via "resend" functionality.
 *
 * @param emailPromise - Promise returned by email provider method
 * @param context - Context for error logging
 *
 * @example
 * ```typescript
 * // Instead of:
 * this.emailProvider
 *   .sendVerificationEmail(email, token, language)
 *   .catch((err) => {
 *     this.logger.error({ err, email }, 'Failed to send verification email');
 *   });
 *
 * // Use:
 * sendEmailSafely(
 *   this.emailProvider.sendVerificationEmail(email, token, language),
 *   { emailType: 'verification', to: email, userId }
 * );
 * ```
 */
export function sendEmailSafely(emailPromise: Promise<boolean>, context: EmailContext): void {
  emailPromise.catch((error: unknown) => {
    const sanitizedContext = { ...context };
    // Mask email for privacy in logs
    if (sanitizedContext.to) {
      const email = sanitizedContext.to;
      sanitizedContext.to = email.replace(/^(.{2}).*@/, '$1***@');
    }

    logger.error(
      {
        err: error,
        ...sanitizedContext,
        recoverable: true,
      },
      `Failed to send ${context.emailType} email - user can request resend`
    );
  });
}

/**
 * Send email and await result (blocking)
 *
 * Use when you need to know if email was sent successfully.
 * Returns false on error instead of throwing.
 *
 * @param emailPromise - Promise returned by email provider method
 * @param context - Context for error logging
 * @returns true if email was sent, false otherwise
 *
 * @example
 * ```typescript
 * const sent = await sendEmailWithResult(
 *   this.emailProvider.sendPasswordResetEmail(email, token, language),
 *   { emailType: 'password-reset', to: email }
 * );
 *
 * if (!sent) {
 *   // Handle failure - maybe queue for retry
 * }
 * ```
 */
export async function sendEmailWithResult(
  emailPromise: Promise<boolean>,
  context: EmailContext
): Promise<boolean> {
  try {
    return await emailPromise;
  } catch (error: unknown) {
    const sanitizedContext = { ...context };
    if (sanitizedContext.to) {
      const email = sanitizedContext.to;
      sanitizedContext.to = email.replace(/^(.{2}).*@/, '$1***@');
    }

    logger.error(
      {
        err: error,
        ...sanitizedContext,
        recoverable: true,
      },
      `Failed to send ${context.emailType} email`
    );
    return false;
  }
}

/**
 * Create a scoped email sender for a use case
 *
 * Returns a function that automatically includes the use case context.
 *
 * @param useCaseName - Name of the use case (for logging)
 * @param baseContext - Base context to include in all email sends
 *
 * @example
 * ```typescript
 * const sendEmail = createEmailSender('RegisterUser', { userId });
 *
 * sendEmail(
 *   this.emailProvider.sendVerificationEmail(email, token),
 *   { emailType: 'verification', to: email }
 * );
 * ```
 */
export function createEmailSender(
  useCaseName: string,
  baseContext: Omit<EmailContext, 'emailType'> = {}
) {
  return (emailPromise: Promise<boolean>, context: EmailContext): void => {
    sendEmailSafely(emailPromise, {
      ...baseContext,
      ...context,
      useCase: useCaseName,
    });
  };
}
