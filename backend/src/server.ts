import { app } from "./app.ts";

import { env } from "./config/env.ts";

import { prisma } from "./config/prisma.ts";

import { logger } from "./config/logger.ts";

async function bootstrap() {
  try {
    await prisma.$connect();

    logger.info(
      "Database connected",
    );

    const server =
      app.listen(
        env.PORT,
        () => {
          logger.info(
            {
              port:
                env.PORT,
            },
            "AuthCore API started",
          );
        },
      );

    const shutdown =
      async (
        signal: string,
      ) => {
        logger.info(
          { signal },
          "Shutting down",
        );

        server.close(
          async () => {
            await prisma.$disconnect();

            logger.info(
              "Shutdown complete",
            );

            process.exit(0);
          },
        );

        setTimeout(() => {
          logger.error(
            "Forced shutdown",
          );

          process.exit(1);
        }, 10_000).unref();
      };

    process.on(
      "SIGTERM",
      () =>
        void shutdown(
          "SIGTERM",
        ),
    );

    process.on(
      "SIGINT",
      () =>
        void shutdown(
          "SIGINT",
        ),
    );
  } catch (error) {
    logger.fatal(
      { err: error },
      "Unable to start AuthCore",
    );

    await prisma.$disconnect();

    process.exit(1);
  }
}

void bootstrap();