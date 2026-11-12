// Public checkout endpoints for a shared invoice. The unguessable share token is the
// customer's access key; every amount is read from the database on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  cancelOrderForToken,
  captureOrderForToken,
  createOrderForToken,
  failOrderForToken,
} from "@/lib/payment-flow.server";

const tokenSchema = z.string().uuid();
const orderIdSchema = z.string().regex(/^[A-Z0-9]{8,40}$/, "Invalid PayPal order id");

function friendly(e: unknown): never {
  const msg = e instanceof Error ? e.message : "";
  if (msg.startsWith("PayPal ")) throw new Error("PayPal is unavailable right now. No money was taken — please try again.");
  throw new Error(msg || "Something went wrong. No money was taken.");
}

export const createPayPalOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await createOrderForToken(data.token);
    } catch (e) {
      friendly(e);
    }
  });

export const capturePayPalOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema, orderId: orderIdSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await captureOrderForToken(data.token, data.orderId);
    } catch (e) {
      friendly(e);
    }
  });

export const cancelPayPalOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: tokenSchema, orderId: orderIdSchema }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await cancelOrderForToken(data.token, data.orderId);
    } catch (e) {
      friendly(e);
    }
  });

export const reportPayPalError = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token: tokenSchema, orderId: orderIdSchema, reason: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      await failOrderForToken(data.token, data.orderId, data.reason);
      return { ok: true };
    } catch (e) {
      friendly(e);
    }
  });
