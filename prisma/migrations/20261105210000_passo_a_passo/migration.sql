-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "onboardingDismissedAt" TIMESTAMP(3),
ADD COLUMN     "testedAt" TIMESTAMP(3);


-- Contas que já existiam (já configuradas) não recebem o passo a passo.
UPDATE "Workspace" SET "onboardingDismissedAt" = CURRENT_TIMESTAMP;
