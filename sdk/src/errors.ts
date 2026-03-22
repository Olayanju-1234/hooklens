export class HookdashError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown,
  ) {
    super(message);
    this.name = 'HookdashError';
  }
}

export class HookdashAuthError extends HookdashError {
  constructor(message = 'Authentication failed — check your API key') {
    super(message, 401);
    this.name = 'HookdashAuthError';
  }
}

export class HookdashNotFoundError extends HookdashError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'HookdashNotFoundError';
  }
}

export class HookdashRateLimitError extends HookdashError {
  constructor() {
    super('Rate limit exceeded — slow down', 429);
    this.name = 'HookdashRateLimitError';
  }
}
