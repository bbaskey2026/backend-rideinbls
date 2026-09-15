import { ZodError } from "zod";

export const validate = (schema) => async (req, res, next) => {
  try {
    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    // Replace with typed/sanitized data
    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;
    next();
  } catch (error) {
    if (error instanceof ZodError || error.issues || error.errors) {
      const issues = error.issues || error.errors || [];
      const formattedErrors = issues.map((err) => {
        const pathSegments = (err.path || []).filter(
          (p) => p !== "body" && p !== "query" && p !== "params"
        );
        return {
          field: pathSegments.join(".") || "payload",
          message: err.message,
        };
      });

      return res.status(400).json({
        success: false,
        message: formattedErrors[0]?.message || "Validation error",
        errors: formattedErrors,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Invalid request payload",
    });
  }
};

export default validate;
