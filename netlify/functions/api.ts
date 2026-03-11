import serverless from "serverless-http";
import { app, connectDB } from "../../server";

const handler = async (event: any, context: any) => {
    await connectDB();
    const serverlessHandler = serverless(app, {
        binary: ['image/*', 'image/jpeg', 'image/png']
    });
    return serverlessHandler(event, context);
};

export { handler };
