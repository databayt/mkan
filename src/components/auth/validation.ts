import * as z from "zod";
import { UserRole } from "@prisma/client";

// Password validation regex patterns
const passwordPatterns = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
  special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
};

// Strong password validator
const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be less than 100 characters")
  .refine((password) => passwordPatterns.uppercase.test(password), {
    message: "Password must contain at least one uppercase letter",
  })
  .refine((password) => passwordPatterns.lowercase.test(password), {
    message: "Password must contain at least one lowercase letter",
  })
  .refine((password) => passwordPatterns.number.test(password), {
    message: "Password must contain at least one number",
  })
  .refine((password) => passwordPatterns.special.test(password), {
    message: "Password must contain at least one special character",
  })
  .refine((password) => {
    // Check for common weak passwords
    const weakPasswords = [
      "password", "12345678", "123456789", "qwerty", "abc123",
      "password123", "admin", "letmein", "welcome", "monkey",
      "dragon", "master", "123123", "password1", "password!"
    ];
    return !weakPasswords.includes(password.toLowerCase());
  }, {
    message: "This password is too common. Please choose a stronger password",
  });

// Moderate password validator (for development/testing)
const moderatePasswordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(100, "Password must be less than 100 characters");

// Use strong password in production, moderate in development
const passwordValidator = process.env.NODE_ENV === "production"
  ? strongPasswordSchema
  : moderatePasswordSchema;

export const SettingsSchema = z.object({
  name: z.optional(z.string()),
  isTwoFactorEnabled: z.optional(z.boolean()),
  role: z.enum([UserRole.ADMIN, UserRole.USER]),
  email: z.optional(z.string().email()),
  password: z.optional(passwordValidator),
  newPassword: z.optional(passwordValidator),
})
  .refine((data) => {
    if (data.password && !data.newPassword) {
      return false;
    }

    return true;
  }, {
    message: "New password is required!",
    path: ["newPassword"]
  })
  .refine((data) => {
    if (data.newPassword && !data.password) {
      return false;
    }

    return true;
  }, {
    message: "Password is required!",
    path: ["password"]
  })

export const NewPasswordSchema = z.object({
  password: passwordValidator,
});

export const ResetSchema = z.object({
  email: z.string().email({
    message: "Email is required",
  }),
});

export const LoginSchema = z.object({
  email: z.string().email({
    message: "Email is required",
  }),
  password: z.string().min(1, {
    message: "Password is required",
  }),
  code: z.optional(z.string()),
});

export const RegisterSchema = z.object({
  email: z.string().email({
    message: "Email is required",
  }),
  password: passwordValidator,
  name: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes"),
});

// Email validation schema with additional checks
export const EmailSchema = z
  .string()
  .email("Invalid email address")
  .toLowerCase()
  .refine((email) => {
    // Check for disposable email providers
    const disposableProviders = [
      "tempmail.com", "throwaway.email", "guerrillamail.com",
      "mailinator.com", "10minutemail.com", "trashmail.com"
    ];
    const domain = email.split('@')[1] ?? '';
    return !disposableProviders.includes(domain);
  }, {
    message: "Disposable email addresses are not allowed",
  });

// Phone validation schema
export const PhoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
  .optional();

// Username validation schema
export const UsernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be less than 30 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens")
  .refine((username) => {
    // Check for reserved usernames
    const reserved = ["admin", "root", "api", "system", "null", "undefined"];
    return !reserved.includes(username.toLowerCase());
  }, {
    message: "This username is reserved",
  });

// Export password strength checker utility
export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (passwordPatterns.uppercase.test(password)) score++;
  if (passwordPatterns.lowercase.test(password)) score++;
  if (passwordPatterns.number.test(password)) score++;
  if (passwordPatterns.special.test(password)) score++;

  // Additional entropy checks
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.7) score++;

  // Provide feedback
  if (password.length < 8) feedback.push("Use at least 8 characters");
  if (!passwordPatterns.uppercase.test(password)) feedback.push("Add uppercase letters");
  if (!passwordPatterns.lowercase.test(password)) feedback.push("Add lowercase letters");
  if (!passwordPatterns.number.test(password)) feedback.push("Add numbers");
  if (!passwordPatterns.special.test(password)) feedback.push("Add special characters");

  return { score: Math.min(score, 5), feedback };
}
