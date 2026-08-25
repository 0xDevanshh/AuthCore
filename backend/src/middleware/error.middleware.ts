import {
  Prisma,
} from "@prisma/client";

import type {
  ErrorRequestHandler,
} from "express";

import {
  ZodError,
} from "zod";

import { AppError } from "../utils/app-error.ts";

import { logger } from "../config/logger.ts";

export const errorHandler: ErrorRequestHandler =
  (
    error,
    _req,
    res,
    _next,
  ) => {
    if (
      error instanceof
      ZodError
    ) {
      const errors =
        error.issues.map(
          (issue) => ({
            field:
              issue.path.join("."),

            message:
              issue.message,
          }),
        );

      res.status(400).json({
        success: false,

        message:
          "Validation failed",

        errors,
      });

      return;
    }

    if (
      error instanceof
      AppError
    ) {
      res
        .status(error.statusCode)
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code,
        });

      return;
    }

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError
    ) {
      if (error.code === "P2002") {
        res.status(409).json({
          success: false,

          message:
            "Resource already exists",
        });

        return;
      }
    }

    logger.error(
      { err: error },
      "Unhandled application error",
    );

    res.status(500).json({
      success: false,

      message:
        "Internal server error",
    });
  };