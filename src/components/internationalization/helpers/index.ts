/**
 * i18n Helper Utilities
 *
 * Typed accessors over `dictionary.messages.{validation,toast,errors}` with
 * support for `{param}` interpolation. Entities are mkan-specific
 * (listing/booking/application/payment/review/host).
 */

import type { Dictionary } from "../dictionaries"

// ============================================================================
// Type Definitions
// ============================================================================

export type Messages = Dictionary["messages"]
export type ValidationMessages = Messages["validation"]
export type ToastMessages = Messages["toast"]
export type ErrorMessages = Messages["errors"]

type MessageParams = Record<string, string | number>

// ============================================================================
// Interpolation
// ============================================================================

/**
 * Replace `{key}` tokens in a message with the given params.
 * @example interpolate("Must be at least {min} characters", { min: 3 })
 */
export function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message
  return Object.entries(params).reduce(
    (msg, [key, value]) =>
      msg.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    message
  )
}

// ============================================================================
// Validation
// ============================================================================

export class ValidationHelper {
  constructor(private messages: ValidationMessages) {}

  required(): string {
    return this.messages.required
  }
  email(): string {
    return this.messages.email
  }
  minLength(min: number): string {
    return interpolate(this.messages.minLength, { min })
  }
  maxLength(max: number): string {
    return interpolate(this.messages.maxLength, { max })
  }
  min(min: number): string {
    return interpolate(this.messages.min, { min })
  }
  max(max: number): string {
    return interpolate(this.messages.max, { max })
  }
  positive(): string {
    return this.messages.positive
  }
  passwordMinLength(): string {
    return this.messages.passwordMinLength
  }
  passwordMismatch(): string {
    return this.messages.passwordMismatch
  }

  title = {
    required: (): string => this.messages.titleRequired,
    tooShort: (min: number): string =>
      interpolate(this.messages.titleTooShort, { min }),
    tooLong: (max: number): string =>
      interpolate(this.messages.titleTooLong, { max }),
  }

  amount = {
    required: (): string => this.messages.amountRequired,
    positive: (): string => this.messages.amountPositive,
  }

  price = {
    required: (): string => this.messages.priceRequired,
    positive: (): string => this.messages.pricePositive,
  }

  rating = {
    required: (): string => this.messages.ratingRequired,
    invalidRange: (min: number, max: number): string =>
      interpolate(this.messages.ratingInvalidRange, { min, max }),
  }

  /** Get any validation message by key, with optional interpolation. */
  get(key: keyof ValidationMessages, params?: MessageParams): string {
    const message = this.messages[key]
    return typeof message === "string"
      ? interpolate(message, params)
      : String(message)
  }
}

// ============================================================================
// Toast
// ============================================================================

export class ToastHelper {
  constructor(private messages: ToastMessages) {}

  success = {
    created: (): string => this.messages.success.created,
    updated: (): string => this.messages.success.updated,
    deleted: (): string => this.messages.success.deleted,
    saved: (): string => this.messages.success.saved,
    uploaded: (): string => this.messages.success.uploaded,
    sent: (): string => this.messages.success.sent,

    auth: {
      loggedIn: (): string => this.messages.success.loggedIn,
      loggedOut: (): string => this.messages.success.loggedOut,
      signedUp: (): string => this.messages.success.signedUp,
    },
    listing: {
      created: (): string => this.messages.success.listingCreated,
      updated: (): string => this.messages.success.listingUpdated,
      deleted: (): string => this.messages.success.listingDeleted,
      published: (): string => this.messages.success.listingPublished,
    },
    booking: {
      created: (): string => this.messages.success.bookingCreated,
      updated: (): string => this.messages.success.bookingUpdated,
      cancelled: (): string => this.messages.success.bookingCancelled,
    },
    application: {
      submitted: (): string => this.messages.success.applicationSubmitted,
      approved: (): string => this.messages.success.applicationApproved,
      rejected: (): string => this.messages.success.applicationRejected,
    },
    payment: {
      processed: (): string => this.messages.success.paymentProcessed,
    },
    review: {
      created: (): string => this.messages.success.reviewCreated,
    },
    host: {
      updated: (): string => this.messages.success.hostUpdated,
    },
  }

  error = {
    generic: (): string => this.messages.error.generic,
    createFailed: (): string => this.messages.error.createFailed,
    updateFailed: (): string => this.messages.error.updateFailed,
    deleteFailed: (): string => this.messages.error.deleteFailed,
    saveFailed: (): string => this.messages.error.saveFailed,
    uploadFailed: (): string => this.messages.error.uploadFailed,

    listing: {
      createFailed: (): string => this.messages.error.listingCreateFailed,
      updateFailed: (): string => this.messages.error.listingUpdateFailed,
      deleteFailed: (): string => this.messages.error.listingDeleteFailed,
    },
    booking: {
      createFailed: (): string => this.messages.error.bookingCreateFailed,
      updateFailed: (): string => this.messages.error.bookingUpdateFailed,
      cancelFailed: (): string => this.messages.error.bookingCancelFailed,
    },
    application: {
      createFailed: (): string => this.messages.error.applicationCreateFailed,
      updateFailed: (): string => this.messages.error.applicationUpdateFailed,
    },
    payment: {
      failed: (): string => this.messages.error.paymentFailed,
    },
    review: {
      createFailed: (): string => this.messages.error.reviewCreateFailed,
    },
    host: {
      updateFailed: (): string => this.messages.error.hostUpdateFailed,
    },
  }

  warning = {
    unsavedChanges: (): string => this.messages.warning.unsavedChanges,
    confirmDelete: (): string => this.messages.warning.confirmDelete,
    confirmCancel: (): string => this.messages.warning.confirmCancel,
    irreversible: (): string => this.messages.warning.irreversible,
  }

  info = {
    loading: (): string => this.messages.info.loading,
    saving: (): string => this.messages.info.saving,
    uploading: (): string => this.messages.info.uploading,
    processing: (): string => this.messages.info.processing,
    searching: (): string => this.messages.info.searching,
  }
}

// ============================================================================
// Errors
// ============================================================================

export class ErrorHelper {
  constructor(private messages: ErrorMessages) {}

  server = {
    internalError: (): string => this.messages.server.internalError,
    databaseError: (): string => this.messages.server.databaseError,
    connectionError: (): string => this.messages.server.connectionError,
    serviceUnavailable: (): string => this.messages.server.serviceUnavailable,
  }

  auth = {
    invalidCredentials: (): string => this.messages.auth.invalidCredentials,
    accountNotFound: (): string => this.messages.auth.accountNotFound,
    accountDisabled: (): string => this.messages.auth.accountDisabled,
    sessionExpired: (): string => this.messages.auth.sessionExpired,
    permissionDenied: (): string => this.messages.auth.permissionDenied,
    notAuthenticated: (): string => this.messages.auth.notAuthenticated,
    emailNotVerified: (): string => this.messages.auth.emailNotVerified,
  }

  resource = {
    notFound: (): string => this.messages.resource.notFound,
    alreadyExists: (): string => this.messages.resource.alreadyExists,
    cannotDelete: (): string => this.messages.resource.cannotDelete,
    cannotModify: (): string => this.messages.resource.cannotModify,
  }

  file = {
    uploadFailed: (): string => this.messages.file.uploadFailed,
    fileTooLarge: (): string => this.messages.file.fileTooLarge,
    invalidType: (): string => this.messages.file.invalidType,
    notFound: (): string => this.messages.file.notFound,
  }

  payment = {
    processingFailed: (): string => this.messages.payment.processingFailed,
    cardDeclined: (): string => this.messages.payment.cardDeclined,
    insufficientFunds: (): string => this.messages.payment.insufficientFunds,
    cardExpired: (): string => this.messages.payment.cardExpired,
    transactionFailed: (): string => this.messages.payment.transactionFailed,
    refundFailed: (): string => this.messages.payment.refundFailed,
  }

  booking = {
    unavailable: (): string => this.messages.booking.unavailable,
    overlap: (): string => this.messages.booking.overlap,
    minStay: (): string => this.messages.booking.minStay,
    maxGuests: (): string => this.messages.booking.maxGuests,
  }
}

// ============================================================================
// Factories
// ============================================================================

/** Create all i18n helpers from a dictionary's `messages`. */
export function createI18nHelpers(messages: Messages) {
  return {
    validation: new ValidationHelper(messages.validation),
    toast: new ToastHelper(messages.toast),
    error: new ErrorHelper(messages.errors),
  }
}

/** Hook-style accessor for client components holding the full dictionary. */
export function useI18nMessages(dictionary: Dictionary) {
  return createI18nHelpers(dictionary.messages)
}

// Direct accessors for server components / actions.
export function getValidationMessages(dictionary: Dictionary) {
  return new ValidationHelper(dictionary.messages.validation)
}
export function getToastMessages(dictionary: Dictionary) {
  return new ToastHelper(dictionary.messages.toast)
}
export function getErrorMessages(dictionary: Dictionary) {
  return new ErrorHelper(dictionary.messages.errors)
}
