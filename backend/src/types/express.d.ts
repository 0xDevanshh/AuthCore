export { };

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;

                sessionId: string;

                applicationId:
                | string
                | null;
            };

            /**
             * Application resolved from the X-AuthCore-Key header by
             * resolveApplication. Present only on end-user auth routes;
             * control-plane routes authenticate with req.auth instead.
             */
            applicationId?: string;
        }
    }
}