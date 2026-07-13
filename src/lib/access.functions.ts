import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const codeSchema = z.object({ code: z.string().min(1) });

export const verifyCompanyCode = createServerFn({ method: "POST" })
  .inputValidator((data) => codeSchema.parse(data))
  .handler(async ({ data }) => {
    const expected = process.env.COMPANY_ACCESS_CODE;
    if (!expected) throw new Error("Company access code is not configured");
    const ok = data.code.trim() === expected.trim();
    return { ok };
  });
