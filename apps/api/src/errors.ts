export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const HttpError = {
  badRequest: (msg: string, code = "BAD_REQUEST") => new AppError(400, code, msg),
  unauthorized: (msg = "Unauthorized") => new AppError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "Forbidden") => new AppError(403, "FORBIDDEN", msg),
  notFound: (msg = "Not found") => new AppError(404, "NOT_FOUND", msg),
  conflict: (msg: string, code = "CONFLICT") => new AppError(409, code, msg),
  unprocessable: (msg: string, code = "UNPROCESSABLE") => new AppError(422, code, msg),
  serviceUnavailable: (msg = "Service unavailable", code = "SERVICE_UNAVAILABLE") =>
    new AppError(503, code, msg),
};
