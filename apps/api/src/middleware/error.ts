import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "VALIDATION",
      message: "Invalid request",
      issues: err.issues,
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  console.error("[unhandled]", err);
  return res.status(500).json({ error: "INTERNAL", message: "Something went wrong" });
};
