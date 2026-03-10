import serverless from "serverless-http";
import { app, connectDB } from "../../server"; // Adjust extension as needed if tsconfig differs

// Ensure database is connected before handling the request
// The db connection is cached globally in server.ts
const handler = async (event: any, context: any) => {
    await connectDB();
    const serverlessHandler = serverless(app);
    return serverlessHandler(event, context);
};

export { handler };
