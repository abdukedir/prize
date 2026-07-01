import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const bootstrapSchema = z.object({
  tenantName: z.string().min(2).max(80),
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8)
});

export const employeeSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  disabled: z.boolean().optional()
});

export const participantSchema = z.object({
  fullName: z.string().min(2).max(120),
  phoneNumber: z.string().min(0).max(40).optional().default(""),
  amountDeposited: z.coerce.number().nonnegative()
});

export const bettingParticipantSchema = z.object({
  name: z.string().min(2).max(120),
  amount: z.coerce.number().nonnegative()
});

export const participantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "WINNER", "LOST", "DISABLED"])
});

export const numberAssignmentSchema = z.object({
  participantId: z.string().min(1),
  selectedNumber: z.coerce.number().int().min(1)
});

export const finishNumbersGameSchema = z.object({
  firstPrizeNumber: z.coerce.number().int().min(1),
  secondPrizeNumber: z.coerce.number().int().min(1)
}).refine((data) => data.firstPrizeNumber !== data.secondPrizeNumber, {
  message: "First and second prize numbers must be different",
  path: ["secondPrizeNumber"]
});

export const settingsSchema = z.object({
  ticketPrice: z.coerce.number().min(1),
  firstPrize: z.coerce.number().min(0),
  secondPrize: z.coerce.number().min(0),
  winnerRate: z.coerce.number().min(0),
  currency: z.string().min(3).max(3).default("ETB"),
  language: z.enum(["en", "am", "om"]).default("en"),
  theme: z.enum(["light", "dark"]).default("light"),
  adminFeePercentage: z.coerce.number().min(0).max(100).optional().default(10)
});

export const manualWinnerSchema = z.object({
  participantId: z.string().min(1)
});

export const roundSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional()
});

const evenOddAmount = z.coerce.number().min(500).max(100000).refine((value) => value % 500 === 0, {
  message: "Amount must use 0.5K increments"
});

export const evenOddCreateRoomSchema = z.object({
  participantId: z.string().min(1),
  side: z.enum(["EVEN", "ODD"]),
  amount: evenOddAmount
});

export const evenOddJoinRoomSchema = z.object({
  participantId: z.string().min(1),
  amount: evenOddAmount
});

export const evenOddPublishResultSchema = z.object({
  selectedNumber: z.coerce.number().int().min(1).max(6)
});

