-- Signature/proof metadata on attachments: who signed (printed name)
-- and an optional free-text note captured alongside the proof. Both
-- nullable so every existing row stays valid.
ALTER TABLE "Attachment" ADD COLUMN "signerName" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "note" TEXT;
