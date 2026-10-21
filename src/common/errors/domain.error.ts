export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(resource: string) {
    super('RESOURCE_NOT_FOUND', `${resource} not found`, 404);
  }
}

export class IncompatibleDimensionsError extends DomainError {
  constructor(message = 'The requested dimensions are not comparable') {
    super('INCOMPATIBLE_DIMENSIONS', message, 422);
  }
}
