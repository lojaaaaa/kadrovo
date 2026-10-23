-- Bind sessions to the credential version observed during authentication.
ALTER TABLE "Account" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AuthSession" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
