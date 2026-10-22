import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as emailService from "../services/emailService.js";

describe("emailService (Resend)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Test <test@example.com>";
    emailService.__setResendForTesting({
      emails: { send: async () => ({ error: null }) },
    });
  });

  after(() => {
    emailService.__setResendForTesting(null);
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("sendEmail calls Resend with correct params and returns on success", async () => {
    await emailService.sendEmail({
      to: "user@example.com",
      subject: "Test Subject",
      text: "Test body",
      html: "<p>Test body</p>",
    });
    assert.ok(true);
  });

  it("sendEmail throws when RESEND_FROM_EMAIL is missing", async () => {
    const originalFrom = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    try {
      await emailService.sendEmail({ to: "x@y.com", subject: "S", text: "t" });
      assert.fail("should have thrown");
    } catch (err) {
      assert.equal(err.code, "MISSING_FROM_EMAIL");
    } finally {
      process.env.RESEND_FROM_EMAIL = originalFrom;
    }
  });

  it("sendEmail throws when Resend returns error", async () => {
    emailService.__setResendForTesting({
      emails: { send: async () => ({ error: { message: "API key invalid", code: "UNAUTHORIZED" } }) },
    });

    try {
      await emailService.sendEmail({ to: "x@y.com", subject: "S", text: "t" });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err.message.includes("Resend send failed"));
      assert.equal(err.code, "UNAUTHORIZED");
    }

    emailService.__setResendForTesting({
      emails: { send: async () => ({ error: null }) },
    });
  });

  it("sendPasswordOtpEmail calls sendEmail with correct template", async () => {
    emailService.__setResendForTesting({
      emails: { send: async (params) => {
        assert.equal(params.to, "user@example.com");
        assert.equal(params.subject, "Stack Overflow Clone - Password Reset OTP");
        assert.ok(params.text.includes("123456"));
        assert.ok(params.html.includes("123456"));
        return { error: null };
      } },
    });

    await emailService.sendPasswordOtpEmail("user@example.com", "123456");
  });

  it("sendNewPasswordEmail calls sendEmail with correct template", async () => {
    emailService.__setResendForTesting({
      emails: { send: async (params) => {
        assert.equal(params.to, "user@example.com");
        assert.equal(params.subject, "Stack Overflow Clone - New Password");
        assert.ok(params.text.includes("TempPass123"));
        assert.ok(params.html.includes("TempPass123"));
        return { error: null };
      } },
    });

    await emailService.sendNewPasswordEmail("user@example.com", "TempPass123");
  });

  it("sendEmail throws when RESEND_API_KEY is missing", async () => {
    emailService.__setResendForTesting(null);
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    try {
      await emailService.sendEmail({ to: "x@y.com", subject: "S", text: "t" });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(["MISSING_API_KEY", "MISSING_FROM_EMAIL"].includes(err.code));
    } finally {
      process.env.RESEND_API_KEY = originalKey;
      emailService.__setResendForTesting({ emails: { send: async () => ({ error: null }) } });
    }
  });
});